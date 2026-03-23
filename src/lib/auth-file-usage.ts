import type {
  AuthFile,
  JsonValue,
  ManagementApiCallRequest,
} from "@/types/management"

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry))
  }

  if (!isObjectRecord(value)) {
    return false
  }

  return Object.values(value).every((entry) => isJsonValue(entry))
}

export function getAuthFileUsageProbeRequest(file: AuthFile): ManagementApiCallRequest | null {
  const probe = file.usage_probe
  if (!isObjectRecord(probe)) {
    return null
  }

  const method = typeof probe.method === "string" ? probe.method.trim() : ""
  const url = typeof probe.url === "string" ? probe.url.trim() : ""

  if (method === "" || url === "") {
    return null
  }

  const authIndex =
    typeof probe.authIndex === "string" && probe.authIndex.trim() !== ""
      ? probe.authIndex.trim()
      : undefined

  const header = isObjectRecord(probe.header)
    ? Object.fromEntries(
        Object.entries(probe.header).filter(([, value]) => typeof value === "string"),
      )
    : undefined

  const body = isJsonValue(probe.body) ? probe.body : undefined

  return {
    ...(authIndex ? { authIndex } : {}),
    method,
    url,
    ...(header ? { header } : {}),
    ...(body !== undefined ? { body } : {}),
  }
}

export function mergeAuthFileUsageResponse(file: AuthFile, payload: unknown): AuthFile {
  if (!isObjectRecord(payload)) {
    return file
  }

  const existingUsage = isObjectRecord(file.usage) ? file.usage : {}

  return {
    ...file,
    usage: {
      ...existingUsage,
      ...payload,
    },
  }
}
