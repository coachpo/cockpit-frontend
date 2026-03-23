import { useRef, useState, type ReactNode } from "react"

import { JsonEditorCard } from "@/components/json-editor-card"
import { SectionCard } from "@/components/section-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { getAuthFileStatusLabel } from "@/lib/auth-file-display"
import {
  getAuthFileUsageProbeRequest,
  mergeAuthFileUsageResponse,
} from "@/lib/auth-file-usage"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  ManagementRequestError,
  createManagementClient,
} from "@/lib/management-api"
import { isManagementActionDisabled } from "@/lib/management-access"
import type {
  AuthFile,
  ModelDefinition,
  OAuthStartResponse,
  OAuthStatusResponse,
  RuntimeSettings,
  StatusOk,
} from "@/types/management"

const NAV_ITEMS = [
  { id: "access", label: "Access" },
  { id: "runtime", label: "Runtime" },
  { id: "api-keys", label: "API Keys" },
  { id: "codex-keys", label: "Codex Keys" },
  { id: "auth-files", label: "Auth Files" },
] as const



const DEFAULT_RUNTIME_SETTINGS: RuntimeSettings = {
  wsAuth: false,
  requestRetry: 0,
  maxRetryInterval: 0,
  routingStrategy: "round-robin",
  switchProject: false,
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

function toTitleLabel(value?: string): string {
  if (!value) {
    return "—"
  }

  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

function formatUsageTimestamp(value?: string): string {
  if (!value) {
    return "—"
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed)
}

function getAuthFileTitle(file: AuthFile): string {
  return file.account ?? file.email ?? file.label ?? file.name
}

function getAuthFilePlan(file: AuthFile): string {
  return toTitleLabel(file.id_token?.plan_type ?? file.account_type)
}

function getAuthFileSubscription(file: AuthFile): string | null {
  const subscription = file.id_token?.subscription
  return typeof subscription === "string" && subscription.trim() !== ""
    ? toTitleLabel(subscription)
    : null
}

function getUsagePercent(value: unknown): number | null {
  const numericValue =
    typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : typeof value === "number"
        ? value
        : Number.NaN

  if (Number.isNaN(numericValue)) {
    return null
  }

  const percent = numericValue <= 1 ? numericValue * 100 : numericValue
  return Math.max(0, Math.min(100, percent))
}

function getAuthFileUsageRows(file: AuthFile): Array<{
  label: string
  percent: number | null
  value?: string
  resetAt?: string
}> {
  const usage = file.usage
  if (!usage || typeof usage !== "object") {
    return []
  }

  const limits = Array.isArray((usage as { limits?: unknown[] }).limits)
    ? (usage as { limits: Array<Record<string, unknown>> }).limits
    : []

  if (limits.length > 0) {
    return limits.slice(0, 3).map((limit, index) => ({
      label:
        (typeof limit.label === "string" && limit.label) ||
        (typeof limit.name === "string" && limit.name) ||
        (typeof limit.limit_name === "string" && limit.limit_name) ||
        `Usage ${index + 1}`,
      percent: getUsagePercent(limit.percent ?? limit.percentage ?? limit.used_ratio),
      value:
        typeof limit.value === "string"
          ? limit.value
          : typeof limit.used === "string"
            ? limit.used
            : undefined,
      resetAt:
        (typeof limit.reset_at === "string" && limit.reset_at) ||
        (typeof limit.next_reset_at === "string" && limit.next_reset_at) ||
        undefined,
    }))
  }

  return Object.entries(usage)
    .filter(([, value]) => value != null)
    .slice(0, 3)
    .map(([label, value]) => {
      if (typeof value === "object" && value !== null) {
        const entry = value as Record<string, unknown>
        return {
          label: toTitleLabel(label),
          percent: getUsagePercent(entry.percent ?? entry.percentage ?? entry.used_ratio),
          value:
            typeof entry.value === "string"
              ? entry.value
              : typeof entry.used === "string"
                ? entry.used
                : undefined,
          resetAt:
            (typeof entry.reset_at === "string" && entry.reset_at) ||
            (typeof entry.next_reset_at === "string" && entry.next_reset_at) ||
            undefined,
        }
      }

      return {
        label: toTitleLabel(label),
        percent: getUsagePercent(value),
        value: typeof value === "string" ? value : String(value),
      }
    })
}

function UsageBar({ percent }: { percent: number | null }) {
  return (
    <div className="h-2 rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${percent ?? 0}%`, opacity: percent === null ? 0 : 1 }}
      />
    </div>
  )
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
  const [managementKey, setManagementKey] = useState("")
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
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettings>(
    DEFAULT_RUNTIME_SETTINGS,
  )
  const [apiKeysText, setApiKeysText] = useState("")
  const [codexKeysText, setCodexKeysText] = useState("[]")
  const [authFiles, setAuthFiles] = useState<AuthFile[]>([])
  const authFilesLoadIdRef = useRef(0)

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

  const accessActionDisabled = isManagementActionDisabled({
    busyAction,
    managementKey,
  })

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

  async function enrichAuthFilesUsage(
    client: ReturnType<typeof createManagementClient>,
    files: AuthFile[],
    loadId: number,
  ) {
    const enrichedFiles = await Promise.allSettled(
      files.map(async (file) => {
        const usageProbe = getAuthFileUsageProbeRequest(file)
        if (!usageProbe) {
          return file
        }

        try {
          const usageResponse = await client.postJson<unknown>("/api-call", usageProbe)
          return mergeAuthFileUsageResponse(file, usageResponse)
        } catch {
          return file
        }
      }),
    )

    if (authFilesLoadIdRef.current !== loadId) {
      return
    }

    setAuthFiles(
      enrichedFiles.map((result, index) =>
        result.status === "fulfilled" ? result.value : files[index],
      ),
    )
  }

  async function loadDashboard(showSuccess: boolean) {
    const loadId = ++authFilesLoadIdRef.current
    const client = createManagementClient(managementKey)
    setConnectionState("loading")

    await withBusy(
      "load-dashboard",
      async () => {
        const [
          wsAuthResult,
          requestRetryResult,
          maxRetryIntervalResult,
          routingStrategyResult,
          switchProjectResult,
          apiKeysResult,
          codexKeysResult,
          authFilesResult,
        ] = await Promise.allSettled([
          client.getJson<{ "ws-auth": boolean }>("/ws-auth"),
          client.getJson<{ "request-retry": number }>("/request-retry"),
          client.getJson<{ "max-retry-interval": number }>(
            "/max-retry-interval",
          ),
          client.getJson<{ strategy: string }>("/routing/strategy"),
          client.getJson<{ "switch-project": boolean }>(
            "/quota-exceeded/switch-project",
          ),
          client.getJson<{ "api-keys": string[] }>("/api-keys"),
          client.getJson<{ "codex-api-key": unknown[] }>("/codex-api-key"),
          client.getJson<{ files: AuthFile[] }>("/auth-files"),
        ])
        if (wsAuthResult.status === "rejected") {
          throw wsAuthResult.reason
        }
        if (requestRetryResult.status === "rejected") {
          throw requestRetryResult.reason
        }
        if (maxRetryIntervalResult.status === "rejected") {
          throw maxRetryIntervalResult.reason
        }
        if (routingStrategyResult.status === "rejected") {
          throw routingStrategyResult.reason
        }
        if (switchProjectResult.status === "rejected") {
          throw switchProjectResult.reason
        }
        if (apiKeysResult.status === "rejected") {
          throw apiKeysResult.reason
        }
        if (codexKeysResult.status === "rejected") {
          throw codexKeysResult.reason
        }
        if (authFilesResult.status === "rejected") {
          throw authFilesResult.reason
        }

        const baseAuthFiles = authFilesResult.value.files

        setRuntimeSettings({
          wsAuth: wsAuthResult.value["ws-auth"],
          requestRetry: requestRetryResult.value["request-retry"],
          maxRetryInterval: maxRetryIntervalResult.value["max-retry-interval"],
          routingStrategy: routingStrategyResult.value.strategy,
          switchProject: switchProjectResult.value["switch-project"],
        })
        setApiKeysText(toStringArray(apiKeysResult.value["api-keys"]).join("\n"))
        setCodexKeysText(
          prettyJson(toUnknownArray(codexKeysResult.value["codex-api-key"])),
        )
        setAuthFiles(baseAuthFiles)
        setConnectionState("ready")

        void enrichAuthFilesUsage(client, baseAuthFiles, loadId)
      },
      showSuccess ? "Management dashboard loaded" : undefined,
    ).catch(() => {
      setConnectionState("error")
    })
  }

  async function saveRuntimeSettings() {
    const client = createManagementClient(managementKey)

    await withBusy(
      "save-runtime",
      async () => {
        const requests: Array<Promise<StatusOk>> = [
          client.putJson<StatusOk>("/ws-auth", {
            value: runtimeSettings.wsAuth,
          }),
          client.putJson<StatusOk>("/request-retry", {
            value: runtimeSettings.requestRetry,
          }),
          client.putJson<StatusOk>("/max-retry-interval", {
            value: runtimeSettings.maxRetryInterval,
          }),
          client.putJson<StatusOk>("/routing/strategy", {
            value: runtimeSettings.routingStrategy,
          }),
          client.putJson<StatusOk>("/quota-exceeded/switch-project", {
            value: runtimeSettings.switchProject,
          }),
        ]

        await Promise.all(requests)
        await loadDashboard(false)
      },
      "Runtime settings saved",
    )
  }

  async function saveApiKeys() {
    const client = createManagementClient(managementKey)
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
    const client = createManagementClient(managementKey)
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
    const client = createManagementClient(managementKey)
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
    const client = createManagementClient(managementKey)
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
    const client = createManagementClient(managementKey)
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
    const client = createManagementClient(managementKey)

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
    const client = createManagementClient(managementKey)
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
    const client = createManagementClient(managementKey)
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
    const client = createManagementClient(managementKey)
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
    const client = createManagementClient(managementKey)
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
            
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Single-page WebUI for the full management API. The default mode uses
            the current origin, which works for local <code>start.sh</code>
            development and reverse-proxied deployments. The only required input
            here is the management key.
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
                    disabled={accessActionDisabled}
                  >
                    Reload
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void loadDashboard(true)}
                    disabled={accessActionDisabled}
                  >
                    Connect
                  </Button>
                </div>
              }
            >
              <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
                <div className="space-y-4">
                  <SettingField
                    label="Management key"
                    description="Sent as the Authorization Bearer token for every request."
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
                      disabled={accessActionDisabled}
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
              {authFiles.length === 0 ? (
                <div className="rounded-lg border border-border/60 py-10 text-center text-muted-foreground">
                  No auth files loaded.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {authFiles.map((file) => {
                    const usageRows = getAuthFileUsageRows(file)
                    const subscriptionLabel = getAuthFileSubscription(file)

                    return (
                      <Card key={file.id} size="sm" className="border border-border/60 shadow-sm">
                        <CardHeader className="space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-2">
                              <Badge variant="secondary" className="w-fit rounded-sm font-normal">
                                {toTitleLabel(file.provider ?? file.type ?? "unknown")}
                              </Badge>
                              <div className="space-y-1">
                                <CardTitle className="text-base break-all">
                                  {getAuthFileTitle(file)}
                                </CardTitle>
                                <CardDescription>{file.name}</CardDescription>
                              </div>
                            </div>
                            <StatusPill
                              label={getAuthFileStatusLabel(file)}
                              tone={file.disabled ? "warning" : file.unavailable ? "destructive" : "success"}
                            />
                          </div>
                        </CardHeader>

                        <Separator className="bg-border/60" />

                        <CardContent className="space-y-4 pt-3 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">Plan</span>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <span className="font-medium">{getAuthFilePlan(file)}</span>
                              {subscriptionLabel ? (
                                <Badge variant="outline" className="font-normal">
                                  {subscriptionLabel}
                                </Badge>
                              ) : null}
                            </div>
                          </div>

                          {usageRows.length === 0 ? (
                            <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-sm text-muted-foreground">
                              No usage data reported.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {usageRows.map((row) => (
                                <div key={row.label} className="space-y-2">
                                  <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="text-muted-foreground">{row.label}</span>
                                    <span className="font-medium">
                                      {row.percent === null ? row.value ?? "—" : `${Math.round(row.percent)}%`}
                                      {row.resetAt ? (
                                        <span className="text-muted-foreground"> {formatUsageTimestamp(row.resetAt)}</span>
                                      ) : null}
                                    </span>
                                  </div>
                                  {row.percent === null ? null : <UsageBar percent={row.percent} />}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                            <div>Source: {file.source ?? "—"}</div>
                            <div>Priority: {file.priority ?? "—"}</div>
                            <div>Updated: {formatDate(file.updated_at ?? file.modtime)}</div>
                            <div>Account: {file.account ?? file.email ?? "—"}</div>
                          </div>
                        </CardContent>

                        <CardFooter className="mt-auto flex flex-wrap gap-2 border-t border-border/60 bg-muted/30">
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
                        </CardFooter>
                      </Card>
                    )
                  })}
                </div>
              )}
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
