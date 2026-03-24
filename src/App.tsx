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
import { MANAGEMENT_BASE_PATH } from "@/types/management"
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
    <Badge variant="outline" className={`rounded-full px-2 text-[10px] uppercase tracking-[0.14em] ${className}`}>
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
    <div className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-4">
      <div className="min-w-0 space-y-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-[11px] leading-5 text-muted-foreground">{description}</div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function SectionFrame({
  id,
  icon,
  title,
  subtitle,
  actions,
  children,
}: {
  id: string
  icon: ReactNode
  title: string
  subtitle: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div id={id} className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-border/60 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/15 text-muted-foreground">
              {icon}
            </div>
            <h2 className="text-base font-medium tracking-tight text-foreground">{title}</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>

        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>

      {children}
    </div>
  )
}

function StripMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail: string
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-medium text-foreground">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail}</div>
    </div>
  )
}

function getFeedbackToneClasses(tone: "success" | "error" | "info") {
  if (tone === "success") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
  }

  if (tone === "error") {
    return "border-destructive/20 bg-destructive/10 text-destructive"
  }

  return "border-primary/20 bg-primary/10 text-primary"
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

function getAuthFileMetadataEntries(file: AuthFile) {
  const entries: Array<{ label: string; value: string }> = []

  if (typeof file.email === "string" && file.email.trim() !== "") {
    entries.push({ label: "Email", value: file.email.trim() })
  }

  if (typeof file.label === "string" && file.label.trim() !== "") {
    entries.push({ label: "Label", value: file.label.trim() })
  }

  if (typeof file.provider === "string" && file.provider.trim() !== "") {
    entries.push({ label: "Provider", value: file.provider.trim() })
  }

  if (typeof file.source === "string" && file.source.trim() !== "") {
    entries.push({ label: "Source", value: file.source.trim() })
  }

  if (typeof file.priority === "number" && !Number.isNaN(file.priority)) {
    entries.push({ label: "Priority", value: String(file.priority) })
  }

  if (typeof file.id === "string" && file.id.trim() !== "") {
    entries.push({ label: "ID", value: file.id.trim() })
  }

  return entries
}

function AuthUsageBar({ window }: { window: AuthUsageWindowSummary }) {
  const toneClasses = getUsageToneClasses(window.tone)

  return (
    <div
      data-slot="auth-usage-bar"
      className="rounded-lg border border-border/60 bg-muted/10 px-2.5 py-2"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <div className="text-[11px] font-medium text-foreground">{window.label}</div>
        <div className="flex items-baseline gap-2 text-[11px] text-muted-foreground sm:justify-end">
          <span className={`text-xs font-semibold ${toneClasses.textClassName}`}>
            {window.percentage}%
          </span>
          {window.detail ? <span>{window.detail}</span> : null}
        </div>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted/70">
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
  const metadataEntries = getAuthFileMetadataEntries(file)
  const hasUsageData = usageWindows.length > 0 || usageEntries.length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Usage summary
        </div>
        {!canQueryUsage ? (
          <Badge variant="outline" className="text-[11px] text-muted-foreground">
            Usage refresh unavailable
          </Badge>
        ) : null}
      </div>

      {usageWindows.length ? (
        <div className="space-y-2">
          {usageWindows.map((window) => (
            <AuthUsageBar key={window.label} window={window} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/10 px-2.5 py-2 text-[11px] leading-5 text-muted-foreground">
          {canQueryUsage
            ? "Query usage to populate this auth file summary."
            : "This auth file does not expose usage refresh."}
        </div>
      )}

      {metadataEntries.length || hasUsageData ? (
        <div className="grid gap-3 border-t border-border/60 pt-3 xl:grid-cols-2">
          {metadataEntries.length ? (
            <div className="space-y-2">
              <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                File details
              </div>
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {metadataEntries.map((entry) => (
                  <div key={`${entry.label}:${entry.value}`} className="grid min-w-0 gap-1">
                    <dt className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {entry.label}
                    </dt>
                    <dd className="break-words text-[13px] font-medium text-foreground">{entry.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {usageEntries.length ? (
            <div className={`space-y-2 ${metadataEntries.length ? "border-t border-border/60 pt-3 xl:border-t-0 xl:border-l xl:pl-4" : ""}`}>
              <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Usage details
              </div>
              <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {usageEntries.map((entry) => (
                  <div key={`${entry.label}:${entry.value}`} className="grid min-w-0 gap-1">
                    <dt className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {entry.label}
                    </dt>
                    <dd className="break-words text-[13px] font-medium text-foreground">{entry.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      ) : null}
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
    <article className="rounded-xl border border-border/70 bg-background/80 px-4 py-3 transition-colors hover:border-primary/20">
      <div className="space-y-3.5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/20 text-muted-foreground">
              <FileText size={14} />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-foreground">{file.name}</h3>
                <StatusPill
                  label={statusLabel}
                  tone={file.status === "error" ? "destructive" : file.disabled ? "warning" : "success"}
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded-full border border-border/60 bg-muted/10 px-2 py-1">
                  {inlineIdentity}
                </span>
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
                {file.status_message ? (
                  <span className="rounded-full border border-border/60 bg-muted/10 px-2 py-1">
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
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(250px,0.95fr)]">
          <div className="min-w-0">
            <AuthFileUsageSummary file={file} canQueryUsage={Boolean(usageRefreshPath)} />
          </div>

          <div className="space-y-3 border-t border-border/60 pt-3 lg:border-t-0 lg:border-l lg:pl-4 lg:pt-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Edit details
                </div>
                <div className="text-[11px] leading-5 text-muted-foreground">
                  Adjust routing priority for this file.
                </div>
              </div>
              <Button size="sm" onClick={() => onSaveDetails(file)} disabled={disabled}>
                <Save size={14} className="mr-2" />
                Save details
              </Button>
            </div>

            <div className="space-y-2.5">
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
              <p className="text-[11px] leading-5 text-muted-foreground">
                Lower values are preferred first. Leave the field unchanged to keep the current backend ordering.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-5 text-muted-foreground">
            Take this file out of rotation without changing saved details.
          </p>
          <Button variant="outline" size="sm" onClick={() => onToggleDisabled(file)} disabled={disabled}>
            <ShieldCheck size={14} className="mr-2" />
            {file.disabled ? "Enable auth file" : "Disable auth file"}
          </Button>
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
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/15">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-muted/20 text-foreground">
                <LayoutDashboard size={16} />
              </div>

              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2 gap-y-1">
                  <h1 className="text-sm font-semibold tracking-tight text-foreground">Cockpit</h1>
                  <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Operations Console
                  </span>
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
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-muted/10 px-2.5 py-1 text-[11px] text-muted-foreground">
                    <ExternalLink size={11} />
                    <span className="truncate">{backendOrigin}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {feedback ? (
                <div
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${getFeedbackToneClasses(feedback.tone)}`}
                >
                  {feedback.tone === "success" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                  <span className="truncate">{feedback.text}</span>
                </div>
              ) : null}

              <Button
                variant="outline"
                size="sm"
                className="bg-background/80"
                onClick={() => void loadDashboard(true)}
                disabled={busyAction !== null}
              >
                {busyAction === "load-dashboard" ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                Sync
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <div className="rounded-[1.5rem] border border-border/70 bg-muted/10">
          <nav className="border-b border-border/60 px-4 py-2.5 sm:px-5 lg:px-6" aria-label="Sections">
            <div className="flex gap-2 overflow-x-auto">
              {NAV_ITEMS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => scrollToSection(item.id)}
                  aria-current={activeSection === item.id ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors ${
                    activeSection === item.id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/70 bg-background/80 text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                  }`}
                >
                  <item.icon size={13} />
                  {item.label}
                </button>
              ))}
            </div>
          </nav>

          <main className="divide-y divide-border/60">
            <section id="api-keys" className="scroll-mt-24 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
              <SectionFrame
                id="api-keys-card"
                icon={<Database size={15} />}
                title="API Keys"
                subtitle="Downstream access keys, one per line."
                actions={
                  <Button
                    size="sm"
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
                  className="min-h-80 border-border/70 bg-background font-mono text-[11px] leading-5"
                  placeholder="sk-..."
                  spellCheck={false}
                />
              </SectionFrame>
            </section>

            <section id="runtime" className="scroll-mt-24 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
              <SectionFrame
                id="runtime-card"
                icon={<Settings2 size={15} />}
                title="Runtime Settings"
                subtitle="Global routing, failover, and retry behavior."
                actions={
                  <Button
                    size="sm"
                    onClick={() => void saveRuntimeSettings()}
                    disabled={busyAction !== null || connectionState !== "ready"}
                  >
                    Apply Changes
                  </Button>
                }
              >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
                  <div className="overflow-hidden rounded-xl border border-border/70 bg-background/75">
                    <div className="divide-y divide-border/60">
                      <SettingField
                        label="WebSocket Authentication"
                        description="Require valid credentials for WS upgrades."
                      >
                        <div className="flex items-center gap-3 sm:justify-end">
                          <span className="text-[11px] font-medium text-muted-foreground">
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
                        <div className="flex items-center gap-3 sm:justify-end">
                          <span className="text-[11px] font-medium text-muted-foreground">
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
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-background/75 px-3 py-3 sm:px-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label htmlFor="runtime-request-retry" className="text-sm font-medium text-foreground">Retry Count</label>
                          <p className="text-[11px] leading-5 text-muted-foreground">
                            Maximum attempts for upstream requests.
                          </p>
                        </div>
                        <Input
                          id="runtime-request-retry"
                          type="number"
                          min={0}
                          className="bg-background"
                          value={runtimeSettings.requestRetry}
                          onChange={(event) =>
                            setRuntimeSettings((current) => ({
                              ...current,
                              requestRetry: Number(event.target.value || 0),
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label htmlFor="runtime-max-retry-interval" className="text-sm font-medium text-foreground">Retry Cooldown</label>
                          <p className="text-[11px] leading-5 text-muted-foreground">
                            Seconds to wait before retrying a credential.
                          </p>
                        </div>
                        <Input
                          id="runtime-max-retry-interval"
                          type="number"
                          min={0}
                          className="bg-background"
                          value={runtimeSettings.maxRetryInterval}
                          onChange={(event) =>
                            setRuntimeSettings((current) => ({
                              ...current,
                              maxRetryInterval: Number(event.target.value || 0),
                            }))
                          }
                        />
                      </div>

                      <div className="space-y-2 sm:col-span-2 xl:col-span-1">
                        <div className="space-y-1">
                          <label htmlFor="runtime-routing-strategy" className="text-sm font-medium text-foreground">Routing Strategy</label>
                          <p className="text-[11px] leading-5 text-muted-foreground">
                            Algorithm for credential selection.
                          </p>
                        </div>
                        <Select
                          value={runtimeSettings.routingStrategy}
                          onValueChange={(value) =>
                            setRuntimeSettings((current) => ({
                              ...current,
                              routingStrategy: value,
                            }))
                          }
                        >
                          <SelectTrigger id="runtime-routing-strategy" className="w-full bg-background">
                            <SelectValue placeholder="Select strategy" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="round-robin">Round Robin</SelectItem>
                            <SelectItem value="fill-first">Fill First</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              </SectionFrame>
            </section>

            <section id="auth-files" className="scroll-mt-24 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
              <SectionFrame
                id="auth-files-card"
                icon={<FileText size={15} />}
                title="Auth Files"
                subtitle="Managed authentication material and OAuth sessions."
              >
                <div className="space-y-4">
                  <div className="rounded-xl border border-border/70 bg-background/75">
                    <div className="flex flex-col gap-3 border-b border-border/60 px-3 py-3 sm:px-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            OAuth
                          </span>
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

                        <div className="text-sm text-foreground">
                          {oauthSession.status !== "idle"
                            ? oauthSession.message
                            : "Start OAuth to launch a new browser handoff for a Codex auth file."}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void queryAllAuthFileUsage()}
                          disabled={
                            busyAction !== null || connectionState !== "ready" || probeCapableAuthFiles.length === 0
                          }
                        >
                          <RefreshCw size={14} className="mr-2" />
                          Query all usage
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void startOAuth()}
                          disabled={busyAction !== null || connectionState !== "ready"}
                        >
                          <ShieldCheck size={14} className="mr-2 text-primary" />
                          Start OAuth
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 px-3 py-3 sm:grid-cols-3 sm:px-4">
                      <StripMetric
                        label="Managed files"
                        value={authFiles.length}
                        detail={`${authFiles.filter((file) => !file.disabled).length} active seats`}
                      />
                      <StripMetric
                        label="Usage-ready files"
                        value={probeCapableAuthFiles.length}
                        detail={
                          probeCapableAuthFiles.length > 0
                            ? "Ready for per-file or batch usage refresh."
                            : "No auth files expose usage refresh."
                        }
                      />
                      <StripMetric
                        label="OAuth state"
                        value={oauthSession.status === "idle" ? "Idle" : oauthSession.status}
                        detail={oauthSession.state ? `State ${oauthSession.state}` : "Browser handoff stays same-origin."}
                      />
                    </div>

                    {oauthSession.status === "pending" && oauthSession.state ? (
                      <form
                        className="border-t border-border/60 px-3 py-3 sm:px-4"
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
                          <p className="text-[11px] leading-5 text-muted-foreground">
                            If the browser does not return here automatically, paste the final callback URL to finish this OAuth session.
                          </p>
                        </div>

                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
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

                  {authFiles.length > 0 ? (
                    <div className="space-y-3">
                      {authFiles.map((file) => (
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
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/10 py-8 text-center">
                      <FileText size={28} className="mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No auth files found</p>
                    </div>
                  )}
                </div>
              </SectionFrame>
            </section>
          </main>
        </div>

        <footer className="mt-4 border-t border-border/60 py-3 text-[11px] text-muted-foreground">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>© 2026 Cockpit Management</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{MANAGEMENT_BASE_PATH}</span>
              <span className="truncate">{backendOrigin}</span>
              <span>Backend selection stays client-side.</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

export default App
