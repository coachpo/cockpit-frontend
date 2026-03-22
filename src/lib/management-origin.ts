export const MANAGEMENT_BASE_URL_STORAGE_KEY = "cockpit.management.base-url"

export function normalizeManagementBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

export function getInitialManagementBaseUrl({
  isDev,
  storedBaseUrl,
}: {
  isDev: boolean
  storedBaseUrl: string | null
}): string {
  const normalizedStoredBaseUrl = normalizeManagementBaseUrl(storedBaseUrl ?? "")

  if (isDev && normalizedStoredBaseUrl === "") {
    return ""
  }

  return normalizedStoredBaseUrl
}

export function hasManagementBaseUrlOverride(baseUrl: string): boolean {
  return normalizeManagementBaseUrl(baseUrl) !== ""
}

export function getManagementBaseUrlSummary(baseUrl: string): string {
  return normalizeManagementBaseUrl(baseUrl) || "current origin"
}
