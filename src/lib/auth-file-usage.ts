import type { AuthFile } from "@/types/management"

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function normalizeUsagePayload(payload: unknown): Record<string, unknown> | null {
  if (!isObjectRecord(payload)) {
    return null
  }

  const body = payload.body
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body)
      if (isObjectRecord(parsed)) {
        return parsed
      }
    } catch {
      return payload
    }
  }

  if (isObjectRecord(body)) {
    return body
  }

  return payload
}

export function getAuthFileUsageRefreshPath(file: AuthFile): string | null {
  const name = typeof file.name === "string" ? file.name.trim() : ""
  if (!file.usage_available || name === "") {
    return null
  }

  return `/auth-files/${encodeURIComponent(name)}/usage`
}

export function mergeAuthFileUsageResponse(file: AuthFile, payload: unknown): AuthFile {
  const normalizedPayload = normalizeUsagePayload(payload)
  if (!normalizedPayload) {
    return file
  }

  const existingUsage = isObjectRecord(file.usage) ? file.usage : {}

  return {
    ...file,
    usage: {
      ...existingUsage,
      ...normalizedPayload,
    },
  }
}
