import { normalizeBackendOrigin } from "@/lib/backend-origin"
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

function buildManagementUrl(backendOrigin: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return new URL(`${MANAGEMENT_BASE_PATH}${normalizedPath}`, backendOrigin).toString()
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
  managementPassword: string,
  extraHeaders?: HeadersInit,
): Headers {
  const headers = new Headers(extraHeaders)
  if (managementPassword !== "" && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${managementPassword}`)
  }
  return headers
}

async function request<T>(
  backendOrigin: string,
  managementPassword: string,
  path: string,
  init?: RequestInit,
  parser?: (response: Response) => Promise<T>,
): Promise<T> {
  const response = await fetch(buildManagementUrl(backendOrigin, path), {
    ...init,
    headers: buildHeaders(managementPassword, init?.headers),
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

export function createManagementClient(backendOrigin: string, managementPassword = "") {
  const resolvedBackendOrigin = normalizeBackendOrigin(backendOrigin)

  return {
    getJson<T>(path: string) {
      return request<T>(resolvedBackendOrigin, managementPassword, path)
    },

    getText(path: string) {
      return request<string>(
        resolvedBackendOrigin,
        managementPassword,
        path,
        undefined,
        (response) => response.text(),
      )
    },

    getBlob(path: string) {
      return request<Blob>(
        resolvedBackendOrigin,
        managementPassword,
        path,
        undefined,
        (response) => response.blob(),
      )
    },

    postJson<T>(path: string, body?: unknown) {
      return request<T>(resolvedBackendOrigin, managementPassword, path, {
        method: "POST",
        ...(body === undefined
          ? {}
          : {
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            }),
      })
    },

    putJson<T>(path: string, body: unknown) {
      return request<T>(resolvedBackendOrigin, managementPassword, path, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    },

    patchJson<T>(path: string, body: unknown) {
      return request<T>(resolvedBackendOrigin, managementPassword, path, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    },

    delete<T>(path: string) {
      return request<T>(resolvedBackendOrigin, managementPassword, path, {
        method: "DELETE",
      })
    },
  }
}
