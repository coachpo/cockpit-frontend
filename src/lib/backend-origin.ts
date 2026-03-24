const SELECTED_BACKEND_ORIGIN_STORAGE_KEY = "cockpit:selected-backend-origin"
const BACKEND_ORIGIN_HISTORY_STORAGE_KEY = "cockpit:backend-origin-history"
const MAX_BACKEND_HISTORY = 6

function getBrowserStorage(storage?: Storage): Storage | null {
  if (storage) {
    return storage
  }

  if (typeof window === "undefined") {
    return null
  }

  return window.localStorage
}

function isHttpOrigin(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:"
}

function dedupeOrigins(origins: string[]): string[] {
  return Array.from(new Set(origins)).slice(0, MAX_BACKEND_HISTORY)
}

export function normalizeBackendOrigin(value: string): string {
  const trimmed = value.trim()
  if (trimmed === "") {
    throw new Error("Enter a backend origin before continuing.")
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error("Backend origin must be a full http:// or https:// URL.")
  }

  if (!isHttpOrigin(parsed)) {
    throw new Error("Backend origin must start with http:// or https://.")
  }

  return parsed.origin
}

export function readBackendOriginHistory(storage?: Storage): string[] {
  const browserStorage = getBrowserStorage(storage)
  if (!browserStorage) {
    return []
  }

  const raw = browserStorage.getItem(BACKEND_ORIGIN_HISTORY_STORAGE_KEY)
  if (!raw) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }

  if (!Array.isArray(parsed)) {
    return []
  }

  const normalizedOrigins = parsed.flatMap((entry) => {
    if (typeof entry !== "string") {
      return []
    }

    try {
      return [normalizeBackendOrigin(entry)]
    } catch {
      return []
    }
  })

  return dedupeOrigins(normalizedOrigins)
}

export function readSelectedBackendOrigin(storage?: Storage): string | null {
  const browserStorage = getBrowserStorage(storage)
  if (!browserStorage) {
    return null
  }

  const raw = browserStorage.getItem(SELECTED_BACKEND_ORIGIN_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return normalizeBackendOrigin(raw)
  } catch {
    return null
  }
}

export function saveSelectedBackendOrigin(origin: string, storage?: Storage): string[] {
  const browserStorage = getBrowserStorage(storage)
  const normalizedOrigin = normalizeBackendOrigin(origin)
  const nextHistory = dedupeOrigins([
    normalizedOrigin,
    ...readBackendOriginHistory(browserStorage ?? undefined).filter(
      (entry) => entry !== normalizedOrigin,
    ),
  ])

  if (browserStorage) {
    browserStorage.setItem(SELECTED_BACKEND_ORIGIN_STORAGE_KEY, normalizedOrigin)
    browserStorage.setItem(
      BACKEND_ORIGIN_HISTORY_STORAGE_KEY,
      JSON.stringify(nextHistory),
    )
  }

  return nextHistory
}
