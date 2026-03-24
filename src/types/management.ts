export const MANAGEMENT_BASE_PATH = "/v0/management"

export interface RuntimeSettings {
  "ws-auth": boolean
  "request-retry": number
  "max-retry-interval": number
  "routing-strategy": string
  "switch-project": boolean
}

export interface RuntimeSettingsFormState {
  wsAuth: boolean
  requestRetry: number
  maxRetryInterval: number
  routingStrategy: string
  switchProject: boolean
}

export interface ApiKeysEnvelope {
  items: string[]
}

export interface StatusOk {
  status: string
}

export interface AuthFile {
  id: string
  auth_index?: string
  name: string
  type?: string
  provider?: string
  proxy_url?: string
  label?: string
  email?: string
  status?: string
  status_message?: string
  disabled?: boolean
  unavailable?: boolean
  runtime_only?: boolean
  source?: string
  size?: number
  modtime?: string
  created_at?: string
  updated_at?: string
  last_refresh?: string
  next_retry_after?: string
  priority?: number
  account_type?: string
  account?: string
  id_token?: {
    plan_type?: string
    subscription?: string
    [key: string]: unknown
  }
  usage?: Record<string, unknown>
  usage_available?: boolean
}

export interface AuthFilesEnvelope {
  items: AuthFile[]
}

export type OAuthProvider = "codex"

export interface OAuthSessionCreateRequest {
  provider: OAuthProvider
}

export interface OAuthSessionCreateResponse {
  status: string
  url: string
  state: string
}

export interface OAuthSessionCallbackRequest {
  redirect_url: string
}

export interface OAuthSessionStatusResponse {
  status: "pending" | "complete" | "error"
  provider: OAuthProvider
  state: string
  error?: string
  auth_file?: string
}
