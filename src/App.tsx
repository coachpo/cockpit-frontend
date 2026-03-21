import { useEffect, useMemo, useState, type ReactNode } from "react"

import { JsonEditorCard } from "@/components/json-editor-card"
import { SectionCard } from "@/components/section-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  ManagementRequestError,
  createManagementClient,
} from "@/lib/management-api"
import type {
  ApiCallResponse,
  AuthFile,
  ModelDefinition,
  OAuthStartResponse,
  OAuthStatusResponse,
  RuntimeSettings,
  StatusOk,
} from "@/types/management"

const STORAGE_KEYS = {
  baseUrl: "cockpit.management.base-url",
  key: "cockpit.management.key",
}

const NAV_ITEMS = [
  { id: "access", label: "Access" },
  { id: "runtime", label: "Runtime" },
  { id: "configuration", label: "Configuration" },
  { id: "api-keys", label: "API Keys" },
  { id: "codex-keys", label: "Codex Keys" },
  { id: "openai-compatibility", label: "OpenAI Compat" },
  { id: "oauth-models", label: "OAuth Models" },
  { id: "auth-files", label: "Auth Files" },
  { id: "api-tool", label: "API Tool" },
] as const

const DEFAULT_API_HEADERS = JSON.stringify(
  {
    Authorization: "Bearer $TOKEN$",
  },
  null,
  2,
)

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  debug: false,
  requestLog: false,
  wsAuth: false,
  requestRetry: 0,
  maxRetryInterval: 0,
  forceModelPrefix: false,
  proxyUrl: "",
  routingStrategy: "round-robin",
  switchProject: false,
  switchPreviewModel: false,
}

function getStoredValue(key: string, fallback = "") {
  return window.localStorage.getItem(key) ?? fallback
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ManagementRequestError) {
    return error.details || error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return "Unknown error"
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2)
}

function parseJsonText<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T
  } catch {
    throw new Error(`${label} must be valid JSON`)
  }
}

function parseApiKeys(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === "string")
}

function toUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toRecordArray(value: unknown): Record<string, unknown[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }

  const entries = Object.entries(value)
  return Object.fromEntries(
    entries.map(([key, item]) => [key, Array.isArray(item) ? item : []]),
  )
}

function formatDate(value?: string): string {
  if (!value) {
    return "—"
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function StatusPill({
  label,
  tone,
}: {
  label: string
  tone: "default" | "success" | "warning" | "destructive"
}) {
  const className =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "destructive"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-border bg-muted text-muted-foreground"

  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  )
}

function SettingField({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      {children}
    </div>
  )
}

function App() {
  const [serverBaseUrl, setServerBaseUrl] = useState(() =>
    getStoredValue(
      STORAGE_KEYS.baseUrl,
      import.meta.env.VITE_MANAGEMENT_API_BASE_URL ?? "",
    ),
  )
  const [managementKey, setManagementKey] = useState(() =>
    getStoredValue(STORAGE_KEYS.key),
  )
  const [connectionState, setConnectionState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle")
  const [feedback, setFeedback] = useState<
    | {
        tone: "success" | "error" | "info"
        text: string
      }
    | null
  >(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const [configJson, setConfigJson] = useState("{}")
  const [configYaml, setConfigYaml] = useState("")
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(
    DEFAULT_RUNTIME_SETTINGS,
  )
  const [apiKeysText, setApiKeysText] = useState("")
  const [codexKeysText, setCodexKeysText] = useState("[]")
  const [openAICompatibilityText, setOpenAICompatibilityText] = useState("[]")
  const [oauthExcludedModelsText, setOauthExcludedModelsText] = useState("{}")
  const [oauthModelAliasText, setOAuthModelAliasText] = useState("{}")
  const [authFiles, setAuthFiles] = useState<AuthFile[]>([])

  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [uploadName, setUploadName] = useState("")
  const [uploadPayload, setUploadPayload] = useState("{}")

  const [fieldEditorOpen, setFieldEditorOpen] = useState(false)
  const [editingAuthName, setEditingAuthName] = useState("")
  const [editingAuthPrefix, setEditingAuthPrefix] = useState("")
  const [editingAuthProxyUrl, setEditingAuthProxyUrl] = useState("")
  const [editingAuthPriority, setEditingAuthPriority] = useState("")
  const [editingAuthNote, setEditingAuthNote] = useState("")

  const [authModelsOpen, setAuthModelsOpen] = useState(false)
  const [authModelsTitle, setAuthModelsTitle] = useState("")
  const [authModels, setAuthModels] = useState<ModelDefinition[]>([])

  const [oauthStatus, setOauthStatus] = useState<
    OAuthStatusResponse & { url?: string; state?: string }
  >({ status: "idle" })

  const [modelCatalogChannel, setModelCatalogChannel] = useState("codex")
  const [modelCatalogText, setModelCatalogText] = useState("[]")

  const [apiCallMethod, setApiCallMethod] = useState("GET")
  const [apiCallAuthIndex, setApiCallAuthIndex] = useState("")
  const [apiCallUrl, setApiCallUrl] = useState("")
  const [apiCallHeaders, setApiCallHeaders] = useState(DEFAULT_API_HEADERS)
  const [apiCallData, setApiCallData] = useState("")
  const [apiCallResponse, setApiCallResponse] = useState<ApiCallResponse | null>(
    null,
  )

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.baseUrl, serverBaseUrl)
  }, [serverBaseUrl])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.key, managementKey)
  }, [managementKey])

  useEffect(() => {
    if (!managementKey.trim()) {
      return
    }

    void loadDashboard(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const authFileOptions = useMemo(
    () =>
      authFiles
        .filter((file) => file.auth_index)
        .map((file) => ({
          authIndex: file.auth_index ?? "",
          label: `${file.name} (${file.provider ?? "unknown"})`,
        })),
    [authFiles],
  )

  async function withBusy<T>(
    action: string,
    work: () => Promise<T>,
    successMessage?: string,
  ) {
    setBusyAction(action)

    try {
      const result = await work()
      if (successMessage) {
        setFeedback({ tone: "success", text: successMessage })
      }
      return result
    } catch (error) {
      setFeedback({ tone: "error", text: getErrorMessage(error) })
      throw error
    } finally {
      setBusyAction((current) => (current === action ? null : current))
    }
  }

  async function loadDashboard(showSuccess: boolean) {
    const client = createManagementClient(serverBaseUrl, managementKey)
    setConnectionState("loading")

    await withBusy(
      "load-dashboard",
      async () => {
        const [
          configResult,
          configYamlResult,
          latestVersionResult,
          debugResult,
          requestLogResult,
          wsAuthResult,
          requestRetryResult,
          maxRetryIntervalResult,
          forceModelPrefixResult,
          routingStrategyResult,
          switchProjectResult,
          switchPreviewModelResult,
          apiKeysResult,
          codexKeysResult,
          openAICompatibilityResult,
          oauthExcludedModelsResult,
          oauthModelAliasResult,
          authFilesResult,
        ] = await Promise.allSettled([
          client.getJson<Record<string, unknown>>("/config"),
          client.getText("/config.yaml"),
          client.getJson<{ "latest-version": string }>("/latest-version"),
          client.getJson<{ debug: boolean }>("/debug"),
          client.getJson<{ "request-log": boolean }>("/request-log"),
          client.getJson<{ "ws-auth": boolean }>("/ws-auth"),
          client.getJson<{ "request-retry": number }>("/request-retry"),
          client.getJson<{ "max-retry-interval": number }>(
            "/max-retry-interval",
          ),
          client.getJson<{ "force-model-prefix": boolean }>(
            "/force-model-prefix",
          ),
          client.getJson<{ strategy: string }>("/routing/strategy"),
          client.getJson<{ "switch-project": boolean }>(
            "/quota-exceeded/switch-project",
          ),
          client.getJson<{ "switch-preview-model": boolean }>(
            "/quota-exceeded/switch-preview-model",
          ),
          client.getJson<{ "api-keys": string[] }>("/api-keys"),
          client.getJson<{ "codex-api-key": unknown[] }>("/codex-api-key"),
          client.getJson<{ "openai-compatibility": unknown[] }>(
            "/openai-compatibility",
          ),
          client.getJson<{ "oauth-excluded-models": Record<string, unknown[]> }>(
            "/oauth-excluded-models",
          ),
          client.getJson<{ "oauth-model-alias": Record<string, unknown[]> }>(
            "/oauth-model-alias",
          ),
          client.getJson<{ files: AuthFile[] }>("/auth-files"),
        ])

        if (configResult.status === "rejected") {
          throw configResult.reason
        }
        if (configYamlResult.status === "rejected") {
          throw configYamlResult.reason
        }
        if (debugResult.status === "rejected") {
          throw debugResult.reason
        }
        if (requestLogResult.status === "rejected") {
          throw requestLogResult.reason
        }
        if (wsAuthResult.status === "rejected") {
          throw wsAuthResult.reason
        }
        if (requestRetryResult.status === "rejected") {
          throw requestRetryResult.reason
        }
        if (maxRetryIntervalResult.status === "rejected") {
          throw maxRetryIntervalResult.reason
        }
        if (forceModelPrefixResult.status === "rejected") {
          throw forceModelPrefixResult.reason
        }
        if (routingStrategyResult.status === "rejected") {
          throw routingStrategyResult.reason
        }
        if (switchProjectResult.status === "rejected") {
          throw switchProjectResult.reason
        }
        if (switchPreviewModelResult.status === "rejected") {
          throw switchPreviewModelResult.reason
        }
        if (apiKeysResult.status === "rejected") {
          throw apiKeysResult.reason
        }
        if (codexKeysResult.status === "rejected") {
          throw codexKeysResult.reason
        }
        if (openAICompatibilityResult.status === "rejected") {
          throw openAICompatibilityResult.reason
        }
        if (oauthExcludedModelsResult.status === "rejected") {
          throw oauthExcludedModelsResult.reason
        }
        if (oauthModelAliasResult.status === "rejected") {
          throw oauthModelAliasResult.reason
        }
        if (authFilesResult.status === "rejected") {
          throw authFilesResult.reason
        }

        setConfigJson(prettyJson(configResult.value))
        setConfigYaml(configYamlResult.value)
        setRuntimeSettings({
          debug: debugResult.value.debug,
          requestLog: requestLogResult.value["request-log"],
          wsAuth: wsAuthResult.value["ws-auth"],
          requestRetry: requestRetryResult.value["request-retry"],
          maxRetryInterval: maxRetryIntervalResult.value["max-retry-interval"],
          forceModelPrefix: forceModelPrefixResult.value["force-model-prefix"],
          proxyUrl:
            (configResult.value["proxy-url"] as string | undefined) ??
            "",
          routingStrategy: routingStrategyResult.value.strategy,
          switchProject: switchProjectResult.value["switch-project"],
          switchPreviewModel:
            switchPreviewModelResult.value["switch-preview-model"],
        })
        setApiKeysText(toStringArray(apiKeysResult.value["api-keys"]).join("\n"))
        setCodexKeysText(
          prettyJson(toUnknownArray(codexKeysResult.value["codex-api-key"])),
        )
        setOpenAICompatibilityText(
          prettyJson(
            toUnknownArray(openAICompatibilityResult.value["openai-compatibility"]),
          ),
        )
        setOauthExcludedModelsText(
          prettyJson(
            toRecordArray(oauthExcludedModelsResult.value["oauth-excluded-models"]),
          ),
        )
        setOAuthModelAliasText(
          prettyJson(
            toRecordArray(oauthModelAliasResult.value["oauth-model-alias"]),
          ),
        )
        setAuthFiles(authFilesResult.value.files)
        setLatestVersion(
          latestVersionResult.status === "fulfilled"
            ? latestVersionResult.value["latest-version"]
            : null,
        )
        setConnectionState("ready")
      },
      showSuccess ? "Management dashboard loaded" : undefined,
    ).catch(() => {
      setConnectionState("error")
    })
  }

  async function saveRuntimeSettings() {
    const client = createManagementClient(serverBaseUrl, managementKey)

    await withBusy(
      "save-runtime",
      async () => {
        const requests: Array<Promise<StatusOk>> = [
          client.putJson<StatusOk>("/debug", {
            value: runtimeSettings.debug,
          }),
          client.putJson<StatusOk>("/request-log", {
            value: runtimeSettings.requestLog,
          }),
          client.putJson<StatusOk>("/ws-auth", {
            value: runtimeSettings.wsAuth,
          }),
          client.putJson<StatusOk>("/request-retry", {
            value: runtimeSettings.requestRetry,
          }),
          client.putJson<StatusOk>("/max-retry-interval", {
            value: runtimeSettings.maxRetryInterval,
          }),
          client.putJson<StatusOk>("/force-model-prefix", {
            value: runtimeSettings.forceModelPrefix,
          }),
          client.putJson<StatusOk>("/routing/strategy", {
            value: runtimeSettings.routingStrategy,
          }),
          client.putJson<StatusOk>("/quota-exceeded/switch-project", {
            value: runtimeSettings.switchProject,
          }),
          client.putJson<StatusOk>("/quota-exceeded/switch-preview-model", {
            value: runtimeSettings.switchPreviewModel,
          }),
        ]

        if (runtimeSettings.proxyUrl.trim()) {
          requests.push(
            client.putJson<StatusOk>("/proxy-url", {
              value: runtimeSettings.proxyUrl.trim(),
            }),
          )
        } else {
          requests.push(client.delete<StatusOk>("/proxy-url"))
        }

        await Promise.all(requests)
        await loadDashboard(false)
      },
      "Runtime settings saved",
    )
  }

  async function saveConfigYaml() {
    const client = createManagementClient(serverBaseUrl, managementKey)
    await withBusy(
      "save-config-yaml",
      async () => {
        await client.putYaml<{ ok: boolean; changed: string[] }>(
          "/config.yaml",
          configYaml,
        )
        await loadDashboard(false)
      },
      "Configuration YAML saved",
    )
  }

  async function saveApiKeys() {
    const client = createManagementClient(serverBaseUrl, managementKey)
    await withBusy(
      "save-api-keys",
      async () => {
        await client.putJson<StatusOk>("/api-keys", parseApiKeys(apiKeysText))
        await loadDashboard(false)
      },
      "API keys updated",
    )
  }

  async function saveJsonResource(
    action: string,
    path: string,
    value: string,
    label: string,
    successMessage: string,
  ) {
    const client = createManagementClient(serverBaseUrl, managementKey)
    await withBusy(
      action,
      async () => {
        await client.putJson<StatusOk>(path, parseJsonText(value, label))
        await loadDashboard(false)
      },
      successMessage,
    )
  }

  async function refreshModelCatalog() {
    const client = createManagementClient(serverBaseUrl, managementKey)
    await withBusy(
      "refresh-model-catalog",
      async () => {
        const response = await client.getJson<{
          channel: string
          models: ModelDefinition[]
        }>(`/model-definitions/${encodeURIComponent(modelCatalogChannel.trim())}`)
        setModelCatalogText(prettyJson(response.models))
      },
      `Loaded model catalog for ${modelCatalogChannel}`,
    )
  }

  async function startCodexOAuth() {
    const client = createManagementClient(serverBaseUrl, managementKey)
    await withBusy("start-codex-oauth", async () => {
      const response = await client.getJson<OAuthStartResponse>(
        "/codex-auth-url?is_webui=true",
      )
      setOauthStatus({ status: "wait", state: response.state, url: response.url })

      const popup = window.open(response.url, "_blank", "noopener,noreferrer")
      if (!popup) {
        setFeedback({
          tone: "info",
          text: "Popup blocked. Use the Open OAuth page button below.",
        })
      }

      const deadline = Date.now() + 10 * 60 * 1000
      while (Date.now() < deadline) {
        const status = await client.getJson<OAuthStatusResponse>(
          `/get-auth-status?state=${encodeURIComponent(response.state)}`,
        )

        if (status.status === "wait") {
          await sleep(1000)
          continue
        }

        if (status.status === "ok") {
          setOauthStatus({
            status: "ok",
            state: response.state,
            url: response.url,
          })
          await loadDashboard(false)
          setFeedback({ tone: "success", text: "Codex OAuth completed" })
          return
        }

        setOauthStatus({
          status: "error",
          error: status.error,
          state: response.state,
          url: response.url,
        })
        setFeedback({ tone: "error", text: status.error ?? "OAuth failed" })
        return
      }

      setOauthStatus({
        status: "error",
        error: "OAuth session timed out",
        state: response.state,
        url: response.url,
      })
      setFeedback({ tone: "error", text: "OAuth session timed out" })
    })
  }

  function populateUploadFromFile(file: File | undefined) {
    if (!file) {
      return
    }

    void file.text().then((text) => {
      setUploadName(file.name)
      setUploadPayload(text)
    })
  }

  async function uploadAuthFile() {
    const client = createManagementClient(serverBaseUrl, managementKey)
    const trimmedName = uploadName.trim()

    await withBusy(
      "upload-auth-file",
      async () => {
        if (!trimmedName) {
          throw new Error("Auth file name is required")
        }
        await client.postJson<StatusOk>(
          `/auth-files?name=${encodeURIComponent(trimmedName)}`,
          parseJsonText<Record<string, unknown>>(uploadPayload, "Auth payload"),
        )
        setUploadDialogOpen(false)
        setUploadName("")
        setUploadPayload("{}")
        await loadDashboard(false)
      },
      "Auth file uploaded",
    )
  }

  function openAuthFieldEditor(file: AuthFile) {
    setEditingAuthName(file.name)
    setEditingAuthPrefix("")
    setEditingAuthProxyUrl("")
    setEditingAuthPriority(file.priority?.toString() ?? "")
    setEditingAuthNote(file.note ?? "")
    setFieldEditorOpen(true)
  }

  async function saveAuthFileFields() {
    const client = createManagementClient(serverBaseUrl, managementKey)

    await withBusy(
      "save-auth-file-fields",
      async () => {
        await client.patchJson<StatusOk>("/auth-files/fields", {
          name: editingAuthName,
          prefix: editingAuthPrefix,
          proxy_url: editingAuthProxyUrl,
          priority: editingAuthPriority.trim()
            ? Number(editingAuthPriority)
            : 0,
          note: editingAuthNote,
        })
        setFieldEditorOpen(false)
        await loadDashboard(false)
      },
      `Updated ${editingAuthName}`,
    )
  }

  async function toggleAuthFile(file: AuthFile) {
    const client = createManagementClient(serverBaseUrl, managementKey)
    await withBusy(
      `toggle-auth-file-${file.id}`,
      async () => {
        await client.patchJson<{ status: string; disabled: boolean }>(
          "/auth-files/status",
          {
            name: file.name,
            disabled: !file.disabled,
          },
        )
        await loadDashboard(false)
      },
      `${file.name} ${file.disabled ? "enabled" : "disabled"}`,
    )
  }

  async function deleteAuthFile(file: AuthFile) {
    const client = createManagementClient(serverBaseUrl, managementKey)
    await withBusy(
      `delete-auth-file-${file.id}`,
      async () => {
        await client.delete<{ status: string }>(
          `/auth-files?name=${encodeURIComponent(file.name)}`,
        )
        await loadDashboard(false)
      },
      `${file.name} deleted`,
    )
  }

  async function downloadAuthFile(file: AuthFile) {
    const client = createManagementClient(serverBaseUrl, managementKey)
    await withBusy(`download-auth-file-${file.id}`, async () => {
      const blob = await client.getBlob(
        `/auth-files/download?name=${encodeURIComponent(file.name)}`,
      )

      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = objectUrl
      link.download = file.name
      link.click()
      URL.revokeObjectURL(objectUrl)
      setFeedback({ tone: "success", text: `${file.name} downloaded` })
    })
  }

  async function loadAuthFileModels(file: AuthFile) {
    const client = createManagementClient(serverBaseUrl, managementKey)
    await withBusy(
      `models-${file.id}`,
      async () => {
        const response = await client.getJson<{ models: ModelDefinition[] }>(
          `/auth-files/models?name=${encodeURIComponent(file.name)}`,
        )
        setAuthModelsTitle(file.name)
        setAuthModels(response.models)
        setAuthModelsOpen(true)
      },
      `Loaded models for ${file.name}`,
    )
  }

  async function runApiTool() {
    const client = createManagementClient(serverBaseUrl, managementKey)
    await withBusy(
      "run-api-tool",
      async () => {
        const headers = parseJsonText<Record<string, string>>(
          apiCallHeaders,
          "API tool headers",
        )
        const response = await client.postJson<ApiCallResponse>("/api-call", {
          auth_index: apiCallAuthIndex || undefined,
          method: apiCallMethod,
          url: apiCallUrl.trim(),
          header: headers,
          data: apiCallData,
        })
        setApiCallResponse(response)
      },
      "API call completed",
    )
  }

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        <div className="mb-6 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              Cockpit management console
            </h1>
            <StatusPill
              label={connectionState}
              tone={
                connectionState === "ready"
                  ? "success"
                  : connectionState === "error"
                    ? "destructive"
                    : connectionState === "loading"
                      ? "warning"
                      : "default"
              }
            />
            {latestVersion ? (
              <Badge variant="outline">Latest version: {latestVersion}</Badge>
            ) : null}
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Single-page WebUI for the full management API. Use a blank backend URL
            when this frontend is reverse proxied with Cockpit, or point it at the
            backend origin directly.
          </p>
          {feedback ? (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                feedback.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : feedback.tone === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-blue-200 bg-blue-50 text-blue-700"
              }`}
            >
              {feedback.text}
            </div>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle>Sections</CardTitle>
                <CardDescription>Jump between management areas.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {NAV_ITEMS.map((item) => (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={() => {
                      document
                        .getElementById(item.id)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </aside>

          <main className="space-y-6">
            <SectionCard
              id="access"
              title="Access"
              description="Configure backend access, load the dashboard, and trigger Codex OAuth."
              actions={
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadDashboard(false)}
                    disabled={busyAction !== null}
                  >
                    Reload
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void loadDashboard(true)}
                    disabled={busyAction !== null || !managementKey.trim()}
                  >
                    Connect
                  </Button>
                </div>
              }
            >
              <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                <div className="space-y-4">
                  <SettingField
                    label="Backend base URL"
                    description="Leave blank to use the current origin. Use the backend origin when frontend and backend are deployed separately."
                  >
                    <Input
                      value={serverBaseUrl}
                      onChange={(event) => setServerBaseUrl(event.target.value)}
                      placeholder="https://backend.example.com"
                    />
                  </SettingField>

                  <SettingField
                    label="Management key"
                    description="Sent as the X-Management-Key header for every request."
                  >
                    <Input
                      type="password"
                      value={managementKey}
                      onChange={(event) => setManagementKey(event.target.value)}
                      placeholder="Enter management key"
                    />
                  </SettingField>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => void startCodexOAuth()}
                      disabled={busyAction !== null || !managementKey.trim()}
                    >
                      Start Codex OAuth
                    </Button>
                    {oauthStatus.url ? (
                      <Button variant="outline" asChild>
                        <a href={oauthStatus.url} target="_blank" rel="noreferrer">
                          Open OAuth page
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-background p-4 text-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="font-medium">OAuth status</div>
                    <StatusPill
                      label={oauthStatus.status}
                      tone={
                        oauthStatus.status === "ok"
                          ? "success"
                          : oauthStatus.status === "error"
                            ? "destructive"
                            : oauthStatus.status === "wait"
                              ? "warning"
                              : "default"
                      }
                    />
                  </div>
                  <div className="space-y-2 text-muted-foreground">
                    <div>State: {oauthStatus.state ?? "—"}</div>
                    <div>Error: {oauthStatus.error ?? "—"}</div>
                    <div>
                      Base URL in use: {serverBaseUrl.trim() || "current origin"}
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              id="runtime"
              title="Runtime settings"
              description="Edit scalar settings exposed by the management API and save them together."
              actions={
                <Button
                  size="sm"
                  onClick={() => void saveRuntimeSettings()}
                  disabled={busyAction !== null || connectionState !== "ready"}
                >
                  Save runtime settings
                </Button>
              }
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SettingField label="Debug" description="Enable verbose backend behavior.">
                  <Switch
                    checked={runtimeSettings.debug}
                    onCheckedChange={(checked) =>
                      setRuntimeSettings((current) => ({ ...current, debug: checked }))
                    }
                  />
                </SettingField>
                <SettingField
                  label="Request log"
                  description="Toggle backend request logging through the newly exposed route."
                >
                  <Switch
                    checked={runtimeSettings.requestLog}
                    onCheckedChange={(checked) =>
                      setRuntimeSettings((current) => ({
                        ...current,
                        requestLog: checked,
                      }))
                    }
                  />
                </SettingField>
                <SettingField
                  label="WebSocket auth"
                  description="Require auth for WebSocket upgrades."
                >
                  <Switch
                    checked={runtimeSettings.wsAuth}
                    onCheckedChange={(checked) =>
                      setRuntimeSettings((current) => ({ ...current, wsAuth: checked }))
                    }
                  />
                </SettingField>
                <SettingField
                  label="Request retry"
                  description="How many times Cockpit retries failed upstream requests."
                >
                  <Input
                    type="number"
                    min={0}
                    value={runtimeSettings.requestRetry}
                    onChange={(event) =>
                      setRuntimeSettings((current) => ({
                        ...current,
                        requestRetry: Number(event.target.value || 0),
                      }))
                    }
                  />
                </SettingField>
                <SettingField
                  label="Max retry interval"
                  description="Cooldown in seconds before retrying an auth entry."
                >
                  <Input
                    type="number"
                    min={0}
                    value={runtimeSettings.maxRetryInterval}
                    onChange={(event) =>
                      setRuntimeSettings((current) => ({
                        ...current,
                        maxRetryInterval: Number(event.target.value || 0),
                      }))
                    }
                  />
                </SettingField>
                <SettingField
                  label="Proxy URL"
                  description="Global proxy for backend-originated HTTP requests."
                >
                  <Input
                    value={runtimeSettings.proxyUrl}
                    onChange={(event) =>
                      setRuntimeSettings((current) => ({
                        ...current,
                        proxyUrl: event.target.value,
                      }))
                    }
                    placeholder="http://127.0.0.1:8080"
                  />
                </SettingField>
                <SettingField
                  label="Force model prefix"
                  description="Require explicit credential prefixes in model names."
                >
                  <Switch
                    checked={runtimeSettings.forceModelPrefix}
                    onCheckedChange={(checked) =>
                      setRuntimeSettings((current) => ({
                        ...current,
                        forceModelPrefix: checked,
                      }))
                    }
                  />
                </SettingField>
                <SettingField
                  label="Switch project on quota exceeded"
                  description="Enable project failover when a quota is exhausted."
                >
                  <Switch
                    checked={runtimeSettings.switchProject}
                    onCheckedChange={(checked) =>
                      setRuntimeSettings((current) => ({
                        ...current,
                        switchProject: checked,
                      }))
                    }
                  />
                </SettingField>
                <SettingField
                  label="Switch preview model on quota exceeded"
                  description="Fallback to preview models when a quota is exhausted."
                >
                  <Switch
                    checked={runtimeSettings.switchPreviewModel}
                    onCheckedChange={(checked) =>
                      setRuntimeSettings((current) => ({
                        ...current,
                        switchPreviewModel: checked,
                      }))
                    }
                  />
                </SettingField>
                <SettingField
                  label="Routing strategy"
                  description="Choose the credential selection strategy."
                >
                  <Select
                    value={runtimeSettings.routingStrategy}
                    onValueChange={(value) =>
                      setRuntimeSettings((current) => ({
                        ...current,
                        routingStrategy: value,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="round-robin">round-robin</SelectItem>
                      <SelectItem value="fill-first">fill-first</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingField>
              </div>
            </SectionCard>

            <SectionCard
              id="configuration"
              title="Configuration"
              description="Edit the raw YAML configuration or inspect the full config JSON payload."
              actions={
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadDashboard(false)}
                    disabled={busyAction !== null}
                  >
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void saveConfigYaml()}
                    disabled={busyAction !== null || connectionState !== "ready"}
                  >
                    Save YAML
                  </Button>
                </div>
              }
            >
              <Tabs defaultValue="yaml">
                <TabsList>
                  <TabsTrigger value="yaml">YAML editor</TabsTrigger>
                  <TabsTrigger value="json">JSON preview</TabsTrigger>
                </TabsList>
                <TabsContent value="yaml" className="pt-4">
                  <Textarea
                    value={configYaml}
                    onChange={(event) => setConfigYaml(event.target.value)}
                    className="min-h-96 font-mono text-xs"
                    spellCheck={false}
                  />
                </TabsContent>
                <TabsContent value="json" className="pt-4">
                  <ScrollArea className="h-96 rounded-lg border border-border/60 bg-background p-3">
                    <pre className="font-mono text-xs leading-5 whitespace-pre-wrap">
                      {configJson}
                    </pre>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </SectionCard>

            <SectionCard
              id="api-keys"
              title="API keys"
              description="Manage the downstream API keys list. One key per line."
              actions={
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadDashboard(false)}
                    disabled={busyAction !== null}
                  >
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void saveApiKeys()}
                    disabled={busyAction !== null || connectionState !== "ready"}
                  >
                    Save API keys
                  </Button>
                </div>
              }
            >
              <Textarea
                value={apiKeysText}
                onChange={(event) => setApiKeysText(event.target.value)}
                className="min-h-52 font-mono text-xs"
                placeholder="one-key-per-line"
                spellCheck={false}
              />
            </SectionCard>

            <JsonEditorCard
              id="codex-keys"
              title="Codex keys"
              description="Replace the full codex-api-key array. Empty base-url values are removed by the backend."
              value={codexKeysText}
              onChange={setCodexKeysText}
              onRefresh={() => void loadDashboard(false)}
              onSave={() =>
                void saveJsonResource(
                  "save-codex-keys",
                  "/codex-api-key",
                  codexKeysText,
                  "Codex keys",
                  "Codex keys updated",
                )
              }
              disabled={busyAction !== null || connectionState !== "ready"}
            />

            <JsonEditorCard
              id="openai-compatibility"
              title="OpenAI compatibility"
              description="Replace the full openai-compatibility array used for external providers."
              value={openAICompatibilityText}
              onChange={setOpenAICompatibilityText}
              onRefresh={() => void loadDashboard(false)}
              onSave={() =>
                void saveJsonResource(
                  "save-openai-compatibility",
                  "/openai-compatibility",
                  openAICompatibilityText,
                  "OpenAI compatibility",
                  "OpenAI compatibility updated",
                )
              }
              disabled={busyAction !== null || connectionState !== "ready"}
            />

            <JsonEditorCard
              id="oauth-models"
              title="OAuth model maps"
              description="Edit the per-provider excluded models and alias maps, plus inspect static model catalogs by channel."
              value={oauthExcludedModelsText}
              onChange={setOauthExcludedModelsText}
              onRefresh={() => void loadDashboard(false)}
              onSave={() =>
                void saveJsonResource(
                  "save-oauth-excluded-models",
                  "/oauth-excluded-models",
                  oauthExcludedModelsText,
                  "OAuth excluded models",
                  "OAuth excluded models updated",
                )
              }
              disabled={busyAction !== null || connectionState !== "ready"}
              helper="This editor writes the oauth-excluded-models map. The alias map editor and model catalog are directly below."
            />

            <JsonEditorCard
              id="oauth-model-alias"
              title="OAuth model alias"
              description="Replace the full oauth-model-alias map."
              value={oauthModelAliasText}
              onChange={setOAuthModelAliasText}
              onRefresh={() => void loadDashboard(false)}
              onSave={() =>
                void saveJsonResource(
                  "save-oauth-model-alias",
                  "/oauth-model-alias",
                  oauthModelAliasText,
                  "OAuth model alias",
                  "OAuth model aliases updated",
                )
              }
              disabled={busyAction !== null || connectionState !== "ready"}
            />

            <SectionCard
              id="model-catalog"
              title="Model catalog"
              description="Read static model definitions by channel."
              actions={
                <Button
                  size="sm"
                  onClick={() => void refreshModelCatalog()}
                  disabled={busyAction !== null || connectionState !== "ready"}
                >
                  Load catalog
                </Button>
              }
            >
              <div className="space-y-3">
                <Input
                  value={modelCatalogChannel}
                  onChange={(event) => setModelCatalogChannel(event.target.value)}
                  placeholder="codex"
                />
                <Textarea
                  value={modelCatalogText}
                  onChange={(event) => setModelCatalogText(event.target.value)}
                  className="min-h-52 font-mono text-xs"
                  spellCheck={false}
                />
              </div>
            </SectionCard>

            <SectionCard
              id="auth-files"
              title="Auth files"
              description="Upload, edit, enable, inspect, download, and delete stored auth files."
              actions={
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadDashboard(false)}
                    disabled={busyAction !== null}
                  >
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setUploadDialogOpen(true)}
                    disabled={busyAction !== null || connectionState !== "ready"}
                  >
                    Upload auth file
                  </Button>
                </div>
              }
            >
              <ScrollArea className="h-[28rem] rounded-lg border border-border/60">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="w-[380px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {authFiles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          No auth files loaded.
                        </TableCell>
                      </TableRow>
                    ) : (
                      authFiles.map((file) => (
                        <TableRow key={file.id}>
                          <TableCell className="font-medium">{file.name}</TableCell>
                          <TableCell>{file.provider ?? file.type ?? "—"}</TableCell>
                          <TableCell>
                            <StatusPill
                              label={file.disabled ? "disabled" : file.status ?? "active"}
                              tone={file.disabled ? "warning" : "success"}
                            />
                          </TableCell>
                          <TableCell>{file.source ?? "—"}</TableCell>
                          <TableCell>{file.email ?? "—"}</TableCell>
                          <TableCell>{file.priority ?? "—"}</TableCell>
                          <TableCell>{formatDate(file.updated_at ?? file.modtime)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => void loadAuthFileModels(file)}
                                disabled={busyAction !== null}
                              >
                                Models
                              </Button>
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => void downloadAuthFile(file)}
                                disabled={busyAction !== null}
                              >
                                Download
                              </Button>
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => openAuthFieldEditor(file)}
                                disabled={busyAction !== null}
                              >
                                Edit fields
                              </Button>
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => void toggleAuthFile(file)}
                                disabled={busyAction !== null}
                              >
                                {file.disabled ? "Enable" : "Disable"}
                              </Button>
                              <Button
                                variant="destructive"
                                size="xs"
                                onClick={() => void deleteAuthFile(file)}
                                disabled={busyAction !== null}
                              >
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </SectionCard>

            <SectionCard
              id="api-tool"
              title="API tool"
              description="Run proxy-aware upstream HTTP calls with optional auth-index token substitution."
              actions={
                <Button
                  size="sm"
                  onClick={() => void runApiTool()}
                  disabled={busyAction !== null || connectionState !== "ready"}
                >
                  Send request
                </Button>
              }
            >
              <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <SettingField
                      label="Method"
                      description="HTTP method sent to the upstream URL."
                    >
                      <Select value={apiCallMethod} onValueChange={setApiCallMethod}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "GET",
                            "POST",
                            "PUT",
                            "PATCH",
                            "DELETE",
                          ].map((method) => (
                            <SelectItem key={method} value={method}>
                              {method}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </SettingField>
                    <SettingField
                      label="Auth index"
                      description="Optional auth_index from the auth files list."
                    >
                      <Select
                        value={apiCallAuthIndex || "__none"}
                        onValueChange={(value) =>
                          setApiCallAuthIndex(value === "__none" ? "" : value)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="No auth selected" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">No auth selected</SelectItem>
                          {authFileOptions.map((item) => (
                            <SelectItem key={item.authIndex} value={item.authIndex}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </SettingField>
                  </div>

                  <SettingField
                    label="URL"
                    description="Absolute upstream URL, including scheme and host."
                  >
                    <Input
                      value={apiCallUrl}
                      onChange={(event) => setApiCallUrl(event.target.value)}
                      placeholder="https://api.example.com/v1/ping"
                    />
                  </SettingField>

                  <SettingField
                    label="Headers"
                    description="Valid JSON object. Use $TOKEN$ to substitute the selected auth token."
                  >
                    <Textarea
                      value={apiCallHeaders}
                      onChange={(event) => setApiCallHeaders(event.target.value)}
                      className="min-h-48 font-mono text-xs"
                      spellCheck={false}
                    />
                  </SettingField>

                  <SettingField
                    label="Body"
                    description="Raw request body string for POST, PUT, or PATCH calls."
                  >
                    <Textarea
                      value={apiCallData}
                      onChange={(event) => setApiCallData(event.target.value)}
                      className="min-h-40 font-mono text-xs"
                      spellCheck={false}
                    />
                  </SettingField>
                </div>

                <div className="space-y-3 rounded-xl border border-border/60 bg-background p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">Response</div>
                      <div className="text-sm text-muted-foreground">
                        Status code, headers, and body from the upstream call.
                      </div>
                    </div>
                    {apiCallResponse ? (
                      <Badge variant="outline">
                        HTTP {apiCallResponse.status_code}
                      </Badge>
                    ) : null}
                  </div>
                  <Separator />
                  <ScrollArea className="h-[28rem] rounded-lg border border-border/60 bg-muted/20 p-3">
                    <pre className="font-mono text-xs leading-5 whitespace-pre-wrap">
                      {apiCallResponse
                        ? prettyJson(apiCallResponse)
                        : "No response yet."}
                    </pre>
                  </ScrollArea>
                </div>
              </div>
            </SectionCard>
          </main>
        </div>
      </div>

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload auth file</DialogTitle>
            <DialogDescription>
              Create or replace a stored auth file by name and raw JSON payload.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={uploadName}
              onChange={(event) => setUploadName(event.target.value)}
              placeholder="account.json"
            />
            <Input
              type="file"
              accept="application/json"
              onChange={(event) => populateUploadFromFile(event.target.files?.[0])}
            />
            <Textarea
              value={uploadPayload}
              onChange={(event) => setUploadPayload(event.target.value)}
              className="min-h-80 font-mono text-xs"
              spellCheck={false}
            />
          </div>
          <DialogFooter showCloseButton>
            <Button onClick={() => void uploadAuthFile()} disabled={busyAction !== null}>
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={fieldEditorOpen} onOpenChange={setFieldEditorOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit auth file fields</DialogTitle>
            <DialogDescription>
              Update prefix, proxy URL, priority, and note for {editingAuthName}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              value={editingAuthPrefix}
              onChange={(event) => setEditingAuthPrefix(event.target.value)}
              placeholder="Prefix"
            />
            <Input
              value={editingAuthProxyUrl}
              onChange={(event) => setEditingAuthProxyUrl(event.target.value)}
              placeholder="Proxy URL"
            />
            <Input
              type="number"
              value={editingAuthPriority}
              onChange={(event) => setEditingAuthPriority(event.target.value)}
              placeholder="Priority (0 clears it)"
            />
            <Input value={editingAuthName} readOnly />
          </div>
          <Textarea
            value={editingAuthNote}
            onChange={(event) => setEditingAuthNote(event.target.value)}
            className="min-h-32"
            placeholder="Note"
          />
          <DialogFooter showCloseButton>
            <Button onClick={() => void saveAuthFileFields()} disabled={busyAction !== null}>
              Save fields
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={authModelsOpen} onOpenChange={setAuthModelsOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Models for {authModelsTitle}</DialogTitle>
            <DialogDescription>
              Static model list returned by the backend for this auth file.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[24rem] rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Display name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Owned by</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {authModels.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      No models returned.
                    </TableCell>
                  </TableRow>
                ) : (
                  authModels.map((model) => (
                    <TableRow key={model.id}>
                      <TableCell className="font-medium">{model.id}</TableCell>
                      <TableCell>{model.display_name ?? "—"}</TableCell>
                      <TableCell>{model.type ?? "—"}</TableCell>
                      <TableCell>{model.owned_by ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default App
