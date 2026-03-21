export const MANAGEMENT_BASE_PATH = "/v0/management"

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface RuntimeSettings {
  debug: boolean
  requestLog: boolean
  wsAuth: boolean
  requestRetry: number
  maxRetryInterval: number
  forceModelPrefix: boolean
  proxyUrl: string
  routingStrategy: string
  switchProject: boolean
  switchPreviewModel: boolean
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
  note?: string
  account_type?: string
  account?: string
}

export interface ModelDefinition {
  id: string
  display_name?: string
  type?: string
  owned_by?: string
}

export interface OAuthStartResponse {
  status: string
  url: string
  state: string
}

export interface OAuthStatusResponse {
  status: string
  error?: string
}

export interface ApiCallResponse {
  status_code: number
  header: Record<string, string[]>
  body: string
}
