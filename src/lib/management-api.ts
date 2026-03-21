import { MANAGEMENT_BASE_PATH } from "@/types/management"

export class ManagementRequestError extends Error {
  readonly status: number
  readonly details: string

  constructor(message: string, status: number, details = "") {
    super(message)
    this.name = "ManagementRequestError"
    this.status = status
    this.details = details
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

function buildManagementUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${normalizeBaseUrl(baseUrl)}${MANAGEMENT_BASE_PATH}${normalizedPath}`
}

async function extractErrorDetails(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? ""

  if (contentType.includes("application/json")) {
    const payload: unknown = await response.json().catch(() => null)
    if (isRecord(payload)) {
      const error = typeof payload.error === "string" ? payload.error : "request failed"
      const message = typeof payload.message === "string" ? payload.message : ""
      return message ? `${error}: ${message}` : error
    }
  }

  const body = await response.text().catch(() => "")
  return body.trim() || response.statusText || "request failed"
}

function buildHeaders(
  managementKey: string,
  extraHeaders?: HeadersInit,
): Headers {
  const key = managementKey.trim()
  if (!key) {
    throw new Error("Management key is required")
  }

  const headers = new Headers(extraHeaders)
  headers.set("X-Management-Key", key)
  return headers
}

async function request<T>(
  baseUrl: string,
  managementKey: string,
  path: string,
  init?: RequestInit,
  parser?: (response: Response) => Promise<T>,
): Promise<T> {
  const response = await fetch(buildManagementUrl(baseUrl, path), {
    ...init,
    headers: buildHeaders(managementKey, init?.headers),
  })

  if (!response.ok) {
    const details = await extractErrorDetails(response)
    throw new ManagementRequestError(
      `Management request failed (${response.status})`,
      response.status,
      details,
    )
  }

  if (parser) {
    return parser(response)
  }

  return (await response.json()) as T
}

export function createManagementClient(baseUrl: string, managementKey: string) {
  return {
    getJson<T>(path: string) {
      return request<T>(baseUrl, managementKey, path)
    },

    getText(path: string) {
      return request<string>(baseUrl, managementKey, path, undefined, (response) => response.text())
    },

    getBlob(path: string) {
      return request<Blob>(baseUrl, managementKey, path, undefined, (response) => response.blob())
    },

    postJson<T>(path: string, body: unknown) {
      return request<T>(baseUrl, managementKey, path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    },

    putJson<T>(path: string, body: unknown) {
      return request<T>(baseUrl, managementKey, path, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    },

    patchJson<T>(path: string, body: unknown) {
      return request<T>(baseUrl, managementKey, path, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    },

    putYaml<T>(path: string, body: string) {
      return request<T>(baseUrl, managementKey, path, {
        method: "PUT",
        headers: {
          "Content-Type": "application/yaml",
        },
        body,
      })
    },

    delete<T>(path: string) {
      return request<T>(baseUrl, managementKey, path, {
        method: "DELETE",
      })
    },
  }
}
