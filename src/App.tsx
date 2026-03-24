import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  LayoutDashboard,
  Settings2,
  Database,
  RefreshCw,
  Save,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Download,
  ShieldCheck,
} from "lucide-react"

import { SectionCard } from "@/components/section-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  ManagementRequestError,
  createManagementClient,
} from "@/lib/management-api"
import {
  getAuthFileUsageRefreshPath,
  mergeAuthFileUsageResponse,
} from "@/lib/auth-file-usage"
import type {
  ApiKeysEnvelope,
  AuthFile,
  AuthFilesEnvelope,
  OAuthSessionCallbackRequest,
  OAuthProvider,
  OAuthSessionCreateRequest,
  OAuthSessionCreateResponse,
  OAuthSessionStatusResponse,
  RuntimeSettings,
  RuntimeSettingsFormState,
  StatusOk,
} from "@/types/management"

const NAV_ITEMS = [
  { id: "api-keys", label: "API Keys", icon: Database },
  { id: "runtime", label: "Runtime Settings", icon: Settings2 },
  { id: "auth-files", label: "Auth Files", icon: FileText },
] as const

const OAUTH_PROVIDER: OAuthProvider = "codex"

const DEFAULT_RUNTIME_SETTINGS: RuntimeSettingsFormState = {
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

function toRuntimeSettingsFormState(settings: RuntimeSettings): RuntimeSettingsFormState {
  return {
    wsAuth: settings["ws-auth"],
    requestRetry: settings["request-retry"],
    maxRetryInterval: settings["max-retry-interval"],
    routingStrategy: settings["routing-strategy"],
    switchProject: settings["switch-project"],
  }
}

function toRuntimeSettingsPayload(settings: RuntimeSettingsFormState): RuntimeSettings {
  return {
    "ws-auth": settings.wsAuth,
    "request-retry": settings.requestRetry,
    "max-retry-interval": settings.maxRetryInterval,
    "routing-strategy": settings.routingStrategy,
    "switch-project": settings.switchProject,
  }
}

function getAuthFilePath(name: string): string {
  return `/auth-files/${encodeURIComponent(name)}`
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
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
      : tone === "warning"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-700"
        : tone === "destructive"
          ? "border-destructive/20 bg-destructive/10 text-destructive"
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
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4 shadow-sm shadow-black/0 transition-colors hover:bg-muted/30">
      <div className="space-y-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs leading-relaxed text-muted-foreground">{description}</div>
      </div>
      {children}
    </div>
  )
}

function createAuthFileDraft(file: AuthFile) {
  return {
    priority: file.priority != null ? String(file.priority) : "",
  }
}

function isUsageRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function formatUsageLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function formatUsagePercentage(value: unknown): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null
  }

  const percent = value <= 1 ? value * 100 : value
  return `${Math.round(percent)}%`
}

function formatDurationLabel(seconds: unknown): string | null {
  if (typeof seconds !== "number" || Number.isNaN(seconds) || seconds < 0) {
    return null
  }

  if (seconds >= 86400) {
    const days = Math.round(seconds / 86400)
    return `${days}d`
  }

  if (seconds >= 3600) {
    const hours = Math.round(seconds / 3600)
    return `${hours}h`
  }

  if (seconds >= 60) {
    const minutes = Math.round(seconds / 60)
    return `${minutes}m`
  }

  return `${Math.round(seconds)}s`
}

type UsageTone = "default" | "success" | "warning" | "destructive"

interface AuthUsageWindowSummary {
  detail: string | null
  label: string
  percentage: number
  tone: UsageTone
}

function clampUsagePercentage(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null
  }

  const percentage = value <= 1 ? value * 100 : value
  return Math.min(100, Math.max(0, Math.round(percentage)))
}

function getUsageToneClasses(tone: UsageTone) {
  if (tone === "success") {
    return {
      panelClassName: "border-emerald-500/15 bg-emerald-500/5",
      barClassName: "bg-emerald-500",
      textClassName: "text-emerald-700",
    }
  }

  if (tone === "warning") {
    return {
      panelClassName: "border-amber-500/15 bg-amber-500/5",
      barClassName: "bg-amber-500",
      textClassName: "text-amber-700",
    }
  }

  if (tone === "destructive") {
    return {
      panelClassName: "border-destructive/15 bg-destructive/5",
      barClassName: "bg-destructive",
      textClassName: "text-destructive",
    }
  }

  return {
    panelClassName: "border-border/70 bg-background/80",
    barClassName: "bg-muted-foreground",
    textClassName: "text-foreground",
  }
}

function getWindowTone(percentage: number): UsageTone {
  if (percentage >= 100) {
    return "destructive"
  }

  if (percentage >= 75) {
    return "warning"
  }

  return "success"
}

function getUsageWindowSummary(label: string, window: Record<string, unknown>): AuthUsageWindowSummary | null {
  const percentage = clampUsagePercentage(window.used_percent ?? window.percentage)
  if (percentage === null) {
    return null
  }

  const reset = formatDurationLabel(window.reset_after_seconds)

  return {
    label,
    percentage,
    tone: getWindowTone(percentage),
    detail: reset ? `resets in ${reset}` : null,
  }
}

function getUsageWindowSummaries(file: AuthFile): AuthUsageWindowSummary[] {
  const rateLimit = isUsageRecord(file.usage?.rate_limit) ? file.usage?.rate_limit : null
  const reviewRateLimit = isUsageRecord(file.usage?.code_review_rate_limit)
    ? file.usage?.code_review_rate_limit
    : null

  const windows: Array<AuthUsageWindowSummary | null> = [
    rateLimit && isUsageRecord(rateLimit.primary_window)
      ? getUsageWindowSummary("5-hour Usage", rateLimit.primary_window)
      : null,
    rateLimit && isUsageRecord(rateLimit.secondary_window)
      ? getUsageWindowSummary("Weekly Usage", rateLimit.secondary_window)
      : null,
    reviewRateLimit && isUsageRecord(reviewRateLimit.primary_window)
      ? getUsageWindowSummary("Code Review Usage", reviewRateLimit.primary_window)
      : null,
  ]

  return windows.filter((window): window is AuthUsageWindowSummary => Boolean(window))
}

function getCreditsEntry(value: unknown): { label: string; value: string } | null {
  if (!isUsageRecord(value)) {
    return null
  }

  if (value.unlimited === true) {
    return { label: "Credits", value: "Unlimited" }
  }

  if (typeof value.balance === "string" && value.balance.trim() !== "") {
    return { label: "Credits", value: `${value.balance.trim()} left` }
  }

  if (value.has_credits === false) {
    return { label: "Credits", value: "No credits" }
  }

  return null
}

function formatUsageValue(value: unknown): string | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value)
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => formatUsageValue(entry))
      .filter((entry): entry is string => Boolean(entry))

    return parts.length ? parts.join(", ") : null
  }

  if (!isUsageRecord(value)) {
    return null
  }

  const parts = [
    typeof value.used === "string" ? value.used : null,
    typeof value.remaining === "string" ? `Remaining ${value.remaining}` : null,
    formatUsagePercentage(value.percentage),
  ].filter((entry): entry is string => Boolean(entry))

  return parts.length ? parts.join(" · ") : null
}

function getAuthFileUsageMetaEntries(usage?: Record<string, unknown>) {
  if (!usage) {
    return []
  }

  const entries: Array<{ label: string; value: string }> = []

  if (typeof usage.plan_type === "string" && usage.plan_type.trim() !== "") {
    entries.push({ label: "Plan", value: usage.plan_type.trim() })
  }

  const creditsEntry = getCreditsEntry(usage.credits)
  if (creditsEntry) {
    entries.push(creditsEntry)
  }

  const limits = Array.isArray(usage.limits) ? usage.limits : []

  limits.forEach((limit) => {
    if (!isUsageRecord(limit)) {
      return
    }

    const label = typeof limit.label === "string" && limit.label.trim() !== ""
      ? limit.label.trim()
      : "Usage"
    const value = formatUsageValue(limit)

    if (value) {
      entries.push({ label, value })
    }
  })

  Object.entries(usage).forEach(([key, value]) => {
    if (["limits", "plan_type", "rate_limit", "code_review_rate_limit", "credits"].includes(key)) {
      return
    }

    const formatted = formatUsageValue(value)
    if (formatted) {
      entries.push({ label: formatUsageLabel(key), value: formatted })
    }
  })

  return entries.slice(0, 8)
}

function AuthUsageBar({ window }: { window: AuthUsageWindowSummary }) {
  const toneClasses = getUsageToneClasses(window.tone)

  return (
    <div
      data-slot="auth-usage-bar"
      className="rounded-lg border border-border/70 bg-background/80 px-3 py-2.5"
    >
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <div className="text-[11px] font-medium text-foreground">
          {window.label}
        </div>
        <div className="flex items-baseline gap-2 text-[11px] text-muted-foreground sm:justify-end">
          <span className={`text-xs font-semibold ${toneClasses.textClassName}`}>
            {window.percentage}%
          </span>
          {window.detail ? <span>{window.detail}</span> : null}
        </div>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/70">
        <div
          className={`h-full rounded-full transition-[width] ${toneClasses.barClassName}`}
          style={{ width: `${window.percentage}%` }}
        />
      </div>
    </div>
  )
}

function AuthFileUsageSummary({
  file,
  canQueryUsage,
}: {
  file: AuthFile
  canQueryUsage: boolean
}) {
  const usageWindows = getUsageWindowSummaries(file)
  const usageEntries = getAuthFileUsageMetaEntries(file.usage)
  const hasUsageData = usageWindows.length > 0 || usageEntries.length > 0

  return (
    <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Usage summary
          </div>
          <div className="text-xs text-muted-foreground">
            Compact access status and usage windows for this auth file.
          </div>
        </div>
        {!canQueryUsage ? (
          <Badge variant="outline" className="text-[11px] text-muted-foreground">
            Usage refresh unavailable
          </Badge>
        ) : null}
      </div>

        {hasUsageData ? (
          <div className="space-y-3">
            {usageWindows.length ? (
              <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Usages
                </div>
                <div className="mt-3 space-y-2">
                  {usageWindows.map((window) => (
                    <AuthUsageBar key={window.label} window={window} />
                  ))}
                </div>
              </div>
            ) : null}

          {usageEntries.length ? (
            <div className="flex flex-wrap gap-2">
              {usageEntries.map((entry) => (
                <div
                  key={`${entry.label}:${entry.value}`}
                  className="min-w-[118px] rounded-lg border border-border/70 bg-background/80 px-3 py-2"
                >
                  <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {entry.label}
                  </div>
                  <div className="mt-1 text-sm font-medium text-foreground">{entry.value}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
          {canQueryUsage
            ? "Query usage to populate this auth file summary."
            : "This auth file does not expose usage refresh."}
        </div>
      )}
    </div>
  )
}
function AuthFileCard({
  file,
  draft,
  disabled,
  onDownload,
  onDraftChange,
  onQueryUsage,
  onSaveDetails,
  onToggleDisabled,
}: {
  file: AuthFile
  draft: ReturnType<typeof createAuthFileDraft>
  disabled: boolean
  onDownload: (file: AuthFile) => void
  onDraftChange: (name: string, field: "priority", value: string) => void
  onQueryUsage: (file: AuthFile) => void
  onSaveDetails: (file: AuthFile) => void
  onToggleDisabled: (file: AuthFile) => void
}) {
  const statusLabel = file.disabled ? "disabled" : file.status || "active"
  const usageRefreshPath = getAuthFileUsageRefreshPath(file)
  const inlineIdentity = file.email || file.label || file.id
  const hasDraftPriority = draft.priority.trim() !== ""

  return (
    <article className="space-y-3 rounded-2xl border border-border/80 bg-card/95 p-4 shadow-sm shadow-black/5 transition-all hover:border-primary/20 hover:shadow-lg hover:shadow-primary/8">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-muted/30 text-primary">
            <FileText size={16} />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">{file.name}</h3>
              <StatusPill
                label={statusLabel}
                tone={file.status === "error" ? "destructive" : file.disabled ? "warning" : "success"}
              />
              {file.provider ? (
                <Badge variant="outline" className="text-[11px] text-muted-foreground">
                  {file.provider}
                </Badge>
              ) : null}
              {file.source ? (
                <Badge variant="outline" className="text-[11px] text-muted-foreground">
                  {file.source}
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1">
                {inlineIdentity}
              </span>
              {file.status_message ? (
                <span className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1">
                  {file.status_message}
                </span>
              ) : null}
              {hasDraftPriority ? (
                <Badge variant="outline" className="text-[11px] text-muted-foreground">
                  Priority {draft.priority.trim()}
                </Badge>
              ) : null}
            </div>

          </div>
        </div>

        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onQueryUsage(file)}
            disabled={disabled || !usageRefreshPath}
          >
            <RefreshCw size={14} className="mr-2" />
            Query usage
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDownload(file)} disabled={disabled}>
            <Download size={14} className="mr-2" />
            Download JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => onToggleDisabled(file)} disabled={disabled}>
            <ShieldCheck size={14} className="mr-2" />
            {file.disabled ? "Enable auth file" : "Disable auth file"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <AuthFileUsageSummary file={file} canQueryUsage={Boolean(usageRefreshPath)} />

        <div className="rounded-xl border border-border/70 bg-muted/10 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Edit details
              </div>
              <div className="text-xs text-muted-foreground">
                Keep auth-file routing priority in sync without expanding the row.
              </div>
            </div>
            <Button size="sm" onClick={() => onSaveDetails(file)} disabled={disabled}>
              <Save size={14} className="mr-2" />
              Save details
            </Button>
          </div>

          <div className="space-y-2">
            <div className="space-y-2">
              <label htmlFor={`auth-priority-${file.name}`} className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Priority
              </label>
              <Input
                id={`auth-priority-${file.name}`}
                type="number"
                min={0}
                aria-label={`Priority for ${file.name}`}
                value={draft.priority}
                onChange={(event) => onDraftChange(file.name, "priority", event.target.value)}
                className="bg-background"
              />
            </div>
            <div className="rounded-lg border border-dashed border-border bg-background/70 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              Lower values are preferred first. Leave the field unchanged to keep the current backend ordering.
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

interface AppProps {
  backendOrigin: string
}

function App({ backendOrigin }: AppProps) {
  const [connectionState, setConnectionState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle")
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error" | "info"
    text: string
  } | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [runtimeSettings, setRuntimeSettings] = useState<RuntimeSettingsFormState>(
    DEFAULT_RUNTIME_SETTINGS,
  )
  const [apiKeysText, setApiKeysText] = useState("")
  const [authFiles, setAuthFiles] = useState<AuthFile[]>([])
  const [authFileDrafts, setAuthFileDrafts] = useState<
    Record<string, ReturnType<typeof createAuthFileDraft>>
  >({})
  const [oauthSession, setOAuthSession] = useState<{
    state: string | null
    status: "idle" | "launching" | "pending" | "complete" | "error"
    message: string
  }>({
    state: null,
    status: "idle",
    message: "",
  })
  const [oauthCallbackUrlDraft, setOAuthCallbackUrlDraft] = useState("")
  const [activeSection, setActiveSection] = useState<string>("api-keys")

  const client = useMemo(() => createManagementClient(backendOrigin), [backendOrigin])
  const observer = useRef<IntersectionObserver | null>(null)
  const activeSectionRef = useRef(activeSection)

  useEffect(() => {
    activeSectionRef.current = activeSection
  }, [activeSection])

  useEffect(() => {
    if (!backendOrigin) {
      return
    }

    setOAuthCallbackUrlDraft("")
  }, [backendOrigin])

  useEffect(() => {
    if (oauthSession.status !== "pending" || !oauthSession.state) {
      setOAuthCallbackUrlDraft("")
    }
  }, [oauthSession.state, oauthSession.status])

  const withBusy = useCallback(async function withBusy<T>(
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
  }, [])

  const loadDashboard = useCallback(async (showSuccess: boolean) => {
    setConnectionState("loading")
    await withBusy(
      "load-dashboard",
      async () => {
        const [runtimeSettingsResult, apiKeysResult, authFilesResult] = await Promise.all([
          client.getJson<RuntimeSettings>("/runtime-settings"),
          client.getJson<ApiKeysEnvelope>("/api-keys"),
          client.getJson<AuthFilesEnvelope>("/auth-files"),
        ])

        setRuntimeSettings(toRuntimeSettingsFormState(runtimeSettingsResult))
        setApiKeysText(toStringArray(apiKeysResult.items).join("\n"))
        setAuthFiles(authFilesResult.items)
        setAuthFileDrafts(
          Object.fromEntries(
            authFilesResult.items.map((file) => [file.name, createAuthFileDraft(file)]),
          ),
        )

        setConnectionState("ready")
      },
      showSuccess ? "Dashboard data loaded" : undefined,
    ).catch(() => {
      setConnectionState("error")
    })
  }, [client, withBusy])

  useEffect(() => {
    void loadDashboard(false)
  }, [loadDashboard])

  const updateActiveSectionFromScroll = useCallback(() => {
    const anchorOffset = 140
    const viewportBottom = window.scrollY + window.innerHeight
    const documentHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    )

    if (viewportBottom >= documentHeight - 1) {
      const lastItem = NAV_ITEMS[NAV_ITEMS.length - 1]
      setActiveSection((current) =>
        current === lastItem.id ? current : lastItem.id,
      )
      return
    }

    let activeId: (typeof NAV_ITEMS)[number]["id"] = NAV_ITEMS[0].id
    let bestPassedTop = Number.NEGATIVE_INFINITY
    let nearestUpcomingTop = Number.POSITIVE_INFINITY

    NAV_ITEMS.forEach((item) => {
      const section = document.getElementById(item.id)
      if (!section) {
        return
      }

      const { top } = section.getBoundingClientRect()

      if (top <= anchorOffset) {
        if (top > bestPassedTop) {
          bestPassedTop = top
          activeId = item.id
        } else if (top === bestPassedTop && activeSectionRef.current === item.id) {
          activeId = item.id
        }
        return
      }

      if (bestPassedTop === Number.NEGATIVE_INFINITY && top < nearestUpcomingTop) {
        nearestUpcomingTop = top
        activeId = item.id
      } else if (
        bestPassedTop === Number.NEGATIVE_INFINITY &&
        top === nearestUpcomingTop &&
        activeSectionRef.current === item.id
      ) {
        activeId = item.id
      }
    })

    setActiveSection((current) => (current === activeId ? current : activeId))
  }, [])

  useEffect(() => {
    if (connectionState !== "ready") {
      return undefined
    }

    updateActiveSectionFromScroll()

    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        })
      },
      { threshold: 0.5, rootMargin: "-10% 0px -70% 0px" },
    )

    NAV_ITEMS.forEach((item) => {
      const section = document.getElementById(item.id)
      if (section) {
        observer.current?.observe(section)
      }
    })

    const handleScroll = () => {
      updateActiveSectionFromScroll()
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    window.addEventListener("resize", handleScroll)

    return () => {
      observer.current?.disconnect()
      window.removeEventListener("scroll", handleScroll)
      window.removeEventListener("resize", handleScroll)
    }
  }, [connectionState, updateActiveSectionFromScroll])

  async function saveRuntimeSettings() {
    await withBusy(
      "save-runtime",
      async () => {
        await client.putJson<StatusOk>(
          "/runtime-settings",
          toRuntimeSettingsPayload(runtimeSettings),
        )
        await loadDashboard(false)
      },
      "Runtime settings saved",
    )
  }

  async function saveApiKeys() {
    await withBusy(
      "save-api-keys",
      async () => {
        await client.putJson<StatusOk>("/api-keys", {
          items: parseApiKeys(apiKeysText),
        })
        await loadDashboard(false)
      },
      "API keys updated",
    )
  }

  const refreshOAuthStatus = useCallback(async (state: string) => {
    try {
      const response = await client.getJson<OAuthSessionStatusResponse>(
        `/oauth-sessions/${encodeURIComponent(state)}`,
      )

      if (response.status === "pending") {
        setOAuthSession({
          state,
          status: "pending",
          message: "Waiting for browser confirmation",
        })
        return
      }

      if (response.status === "error") {
        setOAuthSession({
          state,
          status: "error",
          message: response.error || "OAuth flow failed",
        })
        return
      }

      setOAuthSession({
        state: null,
        status: "complete",
        message: response.auth_file
          ? `OAuth session connected: ${response.auth_file}`
          : "OAuth session connected",
      })
      await loadDashboard(false)
    } catch (error) {
      setOAuthSession({
        state,
        status: "error",
        message: getErrorMessage(error),
      })
    }
  }, [client, loadDashboard])

  useEffect(() => {
    if (oauthSession.status !== "pending" || !oauthSession.state) {
      return undefined
    }

    const state = oauthSession.state
    const timer = window.setInterval(() => {
      void refreshOAuthStatus(state)
    }, 2000)

    return () => {
      window.clearInterval(timer)
    }
  }, [oauthSession.state, oauthSession.status, refreshOAuthStatus])

  async function downloadAuthFile(file: AuthFile) {
    await withBusy("download-auth", async () => {
      const blob = await client.getBlob(`${getAuthFilePath(file.name)}/content`)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    }, "Auth file download started")
  }

  async function startOAuth() {
    setOAuthCallbackUrlDraft("")
    setOAuthSession({
      state: null,
      status: "launching",
      message: "Opening browser sign-in...",
    })

    await withBusy("oauth-start", async () => {
      const request: OAuthSessionCreateRequest = {
        provider: OAUTH_PROVIDER,
      }
      const res = await client.postJson<OAuthSessionCreateResponse>(
        "/oauth-sessions",
        request,
      )

      const popup = window.open(res.url, "_blank")
      if (!popup) {
        setOAuthSession({
          state: null,
          status: "error",
          message: "Browser blocked the OAuth popup. Allow popups and try again.",
        })
        throw new Error("Browser blocked the OAuth popup. Allow popups and try again.")
      }

      setOAuthSession({
        state: res.state,
        status: "pending",
        message: `Waiting for browser confirmation from ${backendOrigin}`,
      })
      await refreshOAuthStatus(res.state)
    }, "OAuth flow opened in new tab").catch(() => undefined)
  }

  async function submitOAuthCallbackUrl() {
    if (oauthSession.status !== "pending" || !oauthSession.state) {
      return
    }

    const redirectUrl = oauthCallbackUrlDraft.trim()
    if (redirectUrl === "") {
      return
    }

    const state = oauthSession.state

    await withBusy(`oauth-callback:${state}`, async () => {
      const request: OAuthSessionCallbackRequest = {
        redirect_url: redirectUrl,
      }

      await client.postJson<StatusOk>(
        `/oauth-sessions/${encodeURIComponent(state)}/callback`,
        request,
      )
      await refreshOAuthStatus(state)
    }).catch(() => undefined)
  }

  async function saveAuthFileDetails(file: AuthFile) {
    const draft = authFileDrafts[file.name] ?? createAuthFileDraft(file)
    const normalizedPriority = draft.priority.trim() === "" ? undefined : Number(draft.priority)

    if (normalizedPriority === undefined) {
      setFeedback({ tone: "info", text: "No auth file changes to save" })
      return
    }

    await withBusy(`save-auth-fields:${file.name}`, async () => {
      await client.patchJson<StatusOk>(getAuthFilePath(file.name), {
        priority: normalizedPriority,
      })
      await loadDashboard(false)
    }, "Auth file details saved")
  }

  async function queryAuthFileUsage(file: AuthFile) {
    const path = getAuthFileUsageRefreshPath(file)
    if (!path) {
      return
    }

    await withBusy(`query-auth-usage:${file.name}`, async () => {
      const response = await client.postJson<unknown>(path)
      setAuthFiles((current) =>
        current.map((currentFile) =>
          currentFile.id === file.id
            ? mergeAuthFileUsageResponse(currentFile, response)
            : currentFile,
        ),
      )
    }, `${file.name} usage refreshed`)
  }

  async function queryAllAuthFileUsage() {
    const filesWithProbes = authFiles
      .map((file) => ({ file, path: getAuthFileUsageRefreshPath(file) }))
      .filter(
        (entry): entry is { file: AuthFile; path: string } => Boolean(entry.path),
      )

    if (!filesWithProbes.length) {
      return
    }

    await withBusy("query-all-auth-usage", async () => {
      const responses = await Promise.all(
        filesWithProbes.map(async ({ file, path }) => ({
          id: file.id,
          usage: await client.postJson<unknown>(path),
        })),
      )

      setAuthFiles((current) =>
        current.map((currentFile) => {
          const match = responses.find((response) => response.id === currentFile.id)
          return match
            ? mergeAuthFileUsageResponse(currentFile, match.usage)
            : currentFile
        }),
      )
    }, "Auth file usage refreshed")
  }

  async function toggleAuthFileDisabled(file: AuthFile) {
    await withBusy(`toggle-auth:${file.name}`, async () => {
      await client.patchJson<StatusOk>(getAuthFilePath(file.name), {
        disabled: !file.disabled,
      })
      await loadDashboard(false)
    }, file.disabled ? "Auth file enabled" : "Auth file disabled")
  }

  function updateAuthFileDraft(
    name: string,
    field: "priority",
    value: string,
  ) {
    setAuthFileDrafts((current) => ({
      ...current,
      [name]: {
        ...(current[name] ?? { priority: "" }),
        [field]: value,
      },
    }))
  }

  const scrollToSection = (id: string) => {
    setActiveSection(id)
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const probeCapableAuthFiles = authFiles.filter((file) => getAuthFileUsageRefreshPath(file))

  return (
    <div className="min-h-screen bg-muted/30 text-foreground font-sans selection:bg-primary/15">
      <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <LayoutDashboard size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">Cockpit</h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Management Console</span>
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
                <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  <ExternalLink size={12} />
                  <span className="truncate">{backendOrigin}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {feedback && (
              <div className={`hidden animate-in fade-in slide-in-from-top-2 md:flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium ${
                feedback.tone === "success"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                  : feedback.tone === "error"
                    ? "border-destructive/20 bg-destructive/10 text-destructive"
                    : "border-primary/20 bg-primary/10 text-primary"
              }`}>
                {feedback.tone === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {feedback.text}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-9 rounded-lg bg-background"
              onClick={() => void loadDashboard(true)}
              disabled={busyAction !== null}
            >
              {busyAction === "load-dashboard" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1 rounded-2xl border border-border/70 bg-background/80 p-3 shadow-sm shadow-black/5">
              <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Configuration
              </p>
              {NAV_ITEMS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  aria-current={activeSection === item.id ? "page" : undefined}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    activeSection === item.id
                      ? "bg-primary/10 text-primary shadow-sm shadow-primary/10"
                      : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
                  }`}
                >
                  <item.icon
                    size={18}
                    className={`transition-colors ${
                      activeSection === item.id ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  />
                  {item.label}
                </button>
              ))}
            </nav>
          </aside>

          <main className="space-y-10">
            <div className="grid gap-8">
              <section id="api-keys" className="scroll-mt-24">
                <SectionCard
                  id="api-keys-card"
                  title="API Keys"
                  description="Downstream access keys (one per line)."
                  className="h-full"
                  actions={
                    <Button
                      size="sm"
                      className="h-8 shadow-sm"
                      onClick={() => void saveApiKeys()}
                      disabled={busyAction !== null || connectionState !== "ready"}
                    >
                      <Save size={14} className="mr-2" />
                      Save Keys
                    </Button>
                  }
                >
                  <Textarea
                    value={apiKeysText}
                    onChange={(event) => setApiKeysText(event.target.value)}
                    className="min-h-[320px] border-border/70 bg-background font-mono text-[11px] leading-relaxed"
                    placeholder="sk-..."
                    spellCheck={false}
                  />
                </SectionCard>
              </section>
            </div>

            <section id="runtime" className="scroll-mt-24">
              <SectionCard
                id="runtime-card"
                title="Runtime Settings"
                description="Global behavior and failover configuration."
                  actions={
                    <Button
                      size="sm"
                      className="h-9 shadow-sm"
                      onClick={() => void saveRuntimeSettings()}
                      disabled={busyAction !== null || connectionState !== "ready"}
                    >
                    Apply Changes
                  </Button>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <SettingField
                    label="WebSocket Authentication"
                    description="Require valid credentials for WS upgrades."
                  >
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {runtimeSettings.wsAuth ? "Enabled" : "Disabled"}
                      </span>
                      <Switch
                        checked={runtimeSettings.wsAuth}
                        onCheckedChange={(checked) =>
                          setRuntimeSettings((current) => ({ ...current, wsAuth: checked }))
                        }
                      />
                    </div>
                  </SettingField>

                  <SettingField
                    label="Project Failover"
                    description="Switch project automatically on quota exhaustion."
                  >
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        {runtimeSettings.switchProject ? "Active" : "Inactive"}
                      </span>
                      <Switch
                        checked={runtimeSettings.switchProject}
                        onCheckedChange={(checked) =>
                          setRuntimeSettings((current) => ({ ...current, switchProject: checked }))
                        }
                      />
                    </div>
                  </SettingField>

                  <SettingField
                    label="Retry Count"
                    description="Maximum attempts for upstream requests."
                  >
                    <Input
                      type="number"
                      min={0}
                      className="h-9 bg-background"
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
                    label="Retry Cooldown"
                    description="Seconds to wait before retrying a credential."
                  >
                    <Input
                      type="number"
                      min={0}
                      className="h-9 bg-background"
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
                    label="Routing Strategy"
                    description="Algorithm for credential selection."
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
                      <SelectTrigger className="h-9 bg-background">
                        <SelectValue placeholder="Select strategy" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="round-robin">Round Robin</SelectItem>
                        <SelectItem value="fill-first">Fill First</SelectItem>
                      </SelectContent>
                    </Select>
                  </SettingField>
                </div>
              </SectionCard>
            </section>

            <section id="auth-files" className="scroll-mt-24">
              <SectionCard
                id="auth-files-card"
                title="Auth Files"
                description="Manage local authentication material and OAuth sessions."
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9"
                      onClick={() => void queryAllAuthFileUsage()}
                      disabled={busyAction !== null || connectionState !== "ready" || probeCapableAuthFiles.length === 0}
                    >
                      <RefreshCw size={14} className="mr-2" />
                      Query all usage
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9"
                      onClick={() => void startOAuth()}
                      disabled={busyAction !== null || connectionState !== "ready"}
                    >
                      <ShieldCheck size={14} className="mr-2 text-primary" />
                      Start OAuth
                    </Button>
                  </div>
                }
              >
                <div className="space-y-4">
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,0.5fr))]">
                    <div className="rounded-2xl border border-border/80 bg-muted/15 p-4 shadow-sm shadow-black/5">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            OAuth
                          </div>
                        </div>
                        {oauthSession.status !== "idle" ? (
                          <StatusPill
                            label={oauthSession.status}
                            tone={
                              oauthSession.status === "complete"
                                ? "success"
                                : oauthSession.status === "error"
                                  ? "destructive"
                                  : oauthSession.status === "pending" || oauthSession.status === "launching"
                                    ? "warning"
                                    : "default"
                            }
                          />
                        ) : null}
                      </div>
                      <div className="space-y-3">
                        {oauthSession.status !== "idle" ? (
                          <div className="rounded-xl border border-border/70 bg-background/80 p-3 text-sm text-muted-foreground">
                            {oauthSession.message}
                          </div>
                        ) : null}

                        {oauthSession.status === "pending" && oauthSession.state ? (
                          <form
                            className="rounded-xl border border-dashed border-border bg-muted/10 p-3"
                            onSubmit={(event) => {
                              event.preventDefault()
                              void submitOAuthCallbackUrl()
                            }}
                          >
                            <div className="space-y-1">
                              <label
                                htmlFor="oauth-callback-url"
                                className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground"
                              >
                                Paste callback URL
                              </label>
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                If the browser does not return here automatically, paste the final callback URL to finish this OAuth session.
                              </p>
                            </div>

                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                              <Input
                                id="oauth-callback-url"
                                aria-label="Pasted OAuth callback URL"
                                value={oauthCallbackUrlDraft}
                                onChange={(event) => setOAuthCallbackUrlDraft(event.target.value)}
                                className="bg-background"
                                placeholder="https://.../callback?state=..."
                                spellCheck={false}
                              />
                              <Button
                                type="submit"
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={
                                  busyAction !== null ||
                                  connectionState !== "ready" ||
                                  oauthCallbackUrlDraft.trim() === ""
                                }
                              >
                                {busyAction === `oauth-callback:${oauthSession.state}` ? (
                                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                ) : null}
                                Submit callback
                              </Button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/80 bg-card/95 p-4 shadow-sm shadow-black/5">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Managed files
                      </div>
                      <div className="mt-1 text-2xl font-semibold text-foreground">{authFiles.length}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {authFiles.filter((file) => !file.disabled).length} active seats
                      </div>
                    </div>

                    <div className="rounded-2xl border border-border/80 bg-card/95 p-4 shadow-sm shadow-black/5">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Usage-ready files
                      </div>
                      <div className="mt-1 text-2xl font-semibold text-foreground">{probeCapableAuthFiles.length}</div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {probeCapableAuthFiles.length > 0
                            ? "Ready for per-file or batch usage refresh."
                            : "No auth files expose usage refresh."}
                        </div>
                      </div>
                    </div>

                  {authFiles.length > 0 ? (
                    authFiles.map((file) => (
                      <AuthFileCard
                        key={file.id}
                        file={file}
                        draft={authFileDrafts[file.name] ?? createAuthFileDraft(file)}
                        disabled={busyAction !== null || connectionState !== "ready"}
                        onDownload={downloadAuthFile}
                        onDraftChange={updateAuthFileDraft}
                        onQueryUsage={queryAuthFileUsage}
                        onSaveDetails={saveAuthFileDetails}
                        onToggleDisabled={toggleAuthFileDisabled}
                      />
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/10 py-10 text-center">
                      <FileText size={32} className="mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No auth files found</p>
                    </div>
                  )}
                </div>
              </SectionCard>
            </section>

            <footer className="border-t border-border/70 pt-10 pb-20">
              <div className="flex flex-col items-center justify-between gap-4 text-xs text-muted-foreground md:flex-row">
                <p>© 2026 Cockpit Management. Backend selection stays client-side.</p>
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-muted-foreground">
                    <ExternalLink size={12} />
                    /v0/management
                  </span>
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-muted-foreground">
                    <span className="truncate">{backendOrigin}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-muted-foreground">
                    Auth file models available
                  </span>
                </div>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
