export const MANAGEMENT_BASE_PATH = "/v0/management"

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export interface ManagementApiCallRequest {
  authIndex?: string
  method: string
  url: string
  header?: Record<string, string>
  body?: JsonValue
}

export interface RuntimeSettings {
  wsAuth: boolean
  requestRetry: number
  maxRetryInterval: number
  routingStrategy: string
  switchProject: boolean
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
  prefix?: string
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
  note?: string
  account_type?: string
  account?: string
  id_token?: {
    plan_type?: string
    subscription?: string
    [key: string]: unknown
  }
  usage?: Record<string, unknown>
  usage_probe?: ManagementApiCallRequest
}

export interface ModelDefinition {
  id: string
  display_name?: string
  version?: string
  description?: string
  context_length?: number
  max_completion_tokens?: number
  supported_parameters?: string[]
  thinking?: {
    levels?: string[]
  }
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
