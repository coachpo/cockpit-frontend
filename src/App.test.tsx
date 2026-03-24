// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"

const fetchMock = vi.fn<typeof fetch>()
const DEFAULT_BACKEND_ORIGIN = "http://127.0.0.1:8080"
const SECONDARY_BACKEND_ORIGIN = "https://backend.example:9443"

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  private readonly callback: IntersectionObserverCallback

  readonly observe = vi.fn()
  readonly unobserve = vi.fn()
  readonly disconnect = vi.fn()

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  trigger(entries: Array<Pick<IntersectionObserverEntry, "target" | "isIntersecting">>) {
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
  }

  static reset() {
    MockIntersectionObserver.instances = []
  }
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

async function flushEffects() {
  await Promise.resolve()
  await Promise.resolve()
}

function getRequestedUrls() {
  return fetchMock.mock.calls.map(([input]) =>
    typeof input === "string" ? input : "url" in input ? input.url : input.toString(),
  )
}

function managementUrl(path: string, origin = DEFAULT_BACKEND_ORIGIN) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return new URL(`/v0/management${normalizedPath}`, origin).toString()
}

function getMatchingRequests(url: string, method?: string) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const requestUrl = typeof input === "string" ? input : "url" in input ? input.url : input.toString()
    const requestMethod = init?.method ?? "GET"
    return requestUrl === url && (method ? requestMethod === method : true)
  })
}

function getJsonRequestBodies(url: string, method?: string) {
  return getMatchingRequests(url, method).map(([, init]) => JSON.parse(String(init?.body ?? "null")))
}

function findButton(container: ParentNode, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(label),
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Unable to find button containing text: ${label}`)
  }

  return button
}

function findInput(container: ParentNode, label: string): HTMLInputElement {
  const input = Array.from(container.querySelectorAll("input")).find((candidate) =>
    candidate.getAttribute("aria-label")?.includes(label),
  )

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Unable to find input containing label: ${label}`)
  }

  return input
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set

  if (!valueSetter) {
    throw new Error("Missing HTMLInputElement value setter")
  }

  valueSetter.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function findAuthFileRow(container: HTMLElement, name: string): HTMLElement {
  const authFilesSection = container.querySelector("#auth-files")
  const row = Array.from(authFilesSection?.querySelectorAll("article") ?? []).find((candidate) =>
    candidate.textContent?.includes(name),
  )

  if (!(row instanceof HTMLElement)) {
    throw new Error(`Unable to find auth file row for: ${name}`)
  }

  return row
}

function setSectionTop(element: Element, top: number) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => ({
      top,
      bottom: top + 320,
      left: 0,
      right: 1280,
      width: 1280,
      height: 320,
      x: 0,
      y: top,
      toJSON: () => ({}),
    })),
  })
}

function setViewportPosition({
  scrollY,
  innerHeight,
  scrollHeight,
}: {
  scrollY: number
  innerHeight: number
  scrollHeight: number
}) {
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: scrollY,
  })

  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: innerHeight,
  })

  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  })
}

function expectNoLegacyRequests() {
  const requestedUrls = getRequestedUrls()

  expect(requestedUrls.some((url) => url.includes("/codex-api-key"))).toBe(false)
  expect(requestedUrls.some((url) => url.includes("/api-call"))).toBe(false)
  expect(requestedUrls.some((url) => url.includes("/codex-auth-url"))).toBe(false)
  expect(requestedUrls.some((url) => url.includes("/get-auth-status"))).toBe(false)
  expect(requestedUrls.some((url) => url.includes("/auth-files/download"))).toBe(false)
  expect(requestedUrls.some((url) => url.includes("/auth-files/status"))).toBe(false)
  expect(requestedUrls.some((url) => url.includes("/auth-files/fields"))).toBe(false)
}

async function renderApp(root: Root, origin = DEFAULT_BACKEND_ORIGIN) {
  await act(async () => {
    root.render(<App key={origin} backendOrigin={origin} />)
    await flushEffects()
  })
}

describe("App", () => {
  let container: HTMLDivElement
  let root: Root
  let openMock: ReturnType<typeof vi.fn>
  let anchorClickMock: ReturnType<typeof vi.fn>
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>
  let oauthSessionStatuses: Array<Record<string, unknown>>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    ;(
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean
      }
    ).IS_REACT_ACT_ENVIRONMENT = true

    window.history.pushState({}, "", "/")
    setViewportPosition({
      scrollY: 0,
      innerHeight: 720,
      scrollHeight: 4000,
    })

    MockIntersectionObserver.reset()
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    })

    openMock = vi.fn(() => ({ closed: false }))
    vi.stubGlobal("open", openMock)

    anchorClickMock = vi.fn()
    Object.defineProperty(HTMLAnchorElement.prototype, "click", {
      configurable: true,
      value: anchorClickMock,
    })

    createObjectURLMock = vi.fn(() => "blob:auth-file")
    revokeObjectURLMock = vi.fn()
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: createObjectURLMock,
    })
    Object.defineProperty(window.URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    })

    oauthSessionStatuses = [
      {
        status: "pending",
        provider: "codex",
        state: "oauth-state-1",
      },
    ]

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : "url" in input ? input.url : input.toString()
      const method = init?.method ?? "GET"
      const pathname = new URL(url).pathname

      switch (`${method} ${pathname}`) {
        case "GET /v0/management/runtime-settings":
          return jsonResponse({
            "ws-auth": false,
            "request-retry": 3,
            "max-retry-interval": 30,
            "routing-strategy": "round-robin",
            "switch-project": true,
          })
        case "PUT /v0/management/runtime-settings":
          return jsonResponse({ status: "ok" })
        case "GET /v0/management/api-keys":
          return jsonResponse({ items: ["sk-primary", "sk-backup"] })
        case "PUT /v0/management/api-keys":
          return jsonResponse({ status: "ok" })
        case "GET /v0/management/auth-files":
          return jsonResponse({
            items: [
              {
                id: "auth-primary",
                name: "primary-codex.json",
                provider: "codex",
                email: "owner@example.com",
                label: "Primary Seat",
                status: "active",
                status_message: "Ready for interactive use",
                priority: 0,
                disabled: false,
                source: "file",
                usage_available: true,
                usage: {
                  limits: [
                    {
                      label: "Messages",
                      percentage: 0.25,
                      used: "10 / 40",
                    },
                  ],
                },
              },
              {
                id: "auth-backup",
                name: "backup-codex.json",
                provider: "codex",
                label: "Backup Seat",
                status: "active",
                status_message: "Warm standby",
                priority: 2,
                disabled: false,
                source: "oauth",
                usage_available: true,
              },
              {
                id: "auth-manual",
                name: "manual-codex.json",
                provider: "codex",
                email: "manual@example.com",
                label: "Manual Seat",
                status: "active",
                status_message: "Imported without usage refresh",
                priority: 4,
                disabled: false,
                source: "file",
                usage_available: false,
              },
            ],
          })
        case "GET /v0/management/auth-files/primary-codex.json/content":
          return new Response(JSON.stringify({ email: "owner@example.com" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        case "PATCH /v0/management/auth-files/primary-codex.json":
          return jsonResponse({ status: "ok" })
        case "POST /v0/management/auth-files/primary-codex.json/usage":
          return jsonResponse({
            limits: [
              {
                label: "Messages",
                percentage: 0.3,
                used: "12 / 40",
              },
            ],
            resets_at: "tomorrow 09:00 UTC",
          })
        case "POST /v0/management/auth-files/backup-codex.json/usage":
          return jsonResponse({
            plan_type: "team",
            rate_limit: {
              allowed: false,
              limit_reached: true,
              primary_window: {
                used_percent: 30,
                limit_window_seconds: 18000,
                reset_after_seconds: 13433,
                reset_at: 1774275058,
              },
              secondary_window: {
                used_percent: 100,
                limit_window_seconds: 604800,
                reset_after_seconds: 451949,
                reset_at: 1774713574,
              },
            },
            code_review_rate_limit: {
              allowed: true,
              limit_reached: false,
              primary_window: {
                used_percent: 82,
                limit_window_seconds: 604800,
                reset_after_seconds: 604800,
                reset_at: 1774866425,
              },
            },
            credits: {
              has_credits: false,
              unlimited: false,
              balance: null,
            },
          })
        case "POST /v0/management/oauth-sessions":
          return jsonResponse({
            status: "ok",
            url: "https://auth.example/codex/start",
            state: "oauth-state-1",
          })
        case "POST /v0/management/oauth-sessions/oauth-state-1/callback":
          return jsonResponse({ status: "ok" })
        case "GET /v0/management/oauth-sessions/oauth-state-1": {
          const response = oauthSessionStatuses.shift() ?? {
            status: "complete",
            provider: "codex",
            state: "oauth-state-1",
            auth_file: "callback-codex.json",
          }
          return jsonResponse(response)
        }
        default:
          return new Response(`Unexpected request: ${method} ${url}`, { status: 404 })
      }
    })

    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })

    container.remove()
    fetchMock.mockReset()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    window.history.pushState({}, "", "/")
  })

  it("loads the redesigned management surface without rendering Codex Keys or calling legacy endpoints", async () => {
    await renderApp(root)

    const requestedUrls = getRequestedUrls()

    expect(requestedUrls).toContain(managementUrl("/runtime-settings"))
    expect(requestedUrls).toContain(managementUrl("/api-keys"))
    expect(requestedUrls).toContain(managementUrl("/auth-files"))
    expect(container.querySelector("#codex-keys")).toBeNull()
    expect(container.textContent).toContain("API Keys")
    expect(container.textContent).toContain("Runtime Settings")
    expect(container.textContent).toContain("Auth Files")
    expect(container.textContent).not.toContain("Codex Keys")
    expect(container.textContent).toContain("Usage-ready files")
    expectNoLegacyRequests()
  })

  it("saves api keys and runtime settings through the redesigned aggregate endpoints", async () => {
    await renderApp(root)

    await act(async () => {
      findButton(container, "Save Keys").click()
      await flushEffects()
    })

    await act(async () => {
      findButton(container, "Apply Changes").click()
      await flushEffects()
    })

    expect(getJsonRequestBodies(managementUrl("/api-keys"), "PUT")).toContainEqual({
      items: ["sk-primary", "sk-backup"],
    })
    expect(getJsonRequestBodies(managementUrl("/runtime-settings"), "PUT")).toContainEqual({
      "ws-auth": false,
      "request-retry": 3,
      "max-retry-interval": 30,
      "routing-strategy": "round-robin",
      "switch-project": true,
    })
    expectNoLegacyRequests()
  })

  it("uses path-based auth-file actions for usage refresh, download, and patch mutations", async () => {
    await renderApp(root)

    const primaryRow = findAuthFileRow(container, "primary-codex.json")
    const manualRow = findAuthFileRow(container, "manual-codex.json")

    expect(primaryRow.textContent).toContain("10 / 40")
    expect(findButton(manualRow, "Query usage").disabled).toBe(true)

    await act(async () => {
      findButton(primaryRow, "Query usage").click()
      await flushEffects()
    })

    expect(primaryRow.textContent).toContain("12 / 40")
    expect(primaryRow.textContent).toContain("tomorrow 09:00 UTC")

    await act(async () => {
      findButton(primaryRow, "Download JSON").click()
      await flushEffects()
    })

    await act(async () => {
      findButton(primaryRow, "Save details").click()
      await flushEffects()
    })

    await act(async () => {
      findButton(primaryRow, "Disable auth file").click()
      await flushEffects()
    })

    expect(getRequestedUrls()).toContain(managementUrl("/auth-files/primary-codex.json/usage"))
    expect(getRequestedUrls()).toContain(managementUrl("/auth-files/primary-codex.json/content"))
    expect(getJsonRequestBodies(managementUrl("/auth-files/primary-codex.json"), "PATCH")).toEqual([
      { priority: 0 },
      { disabled: true },
    ])
    expect(anchorClickMock).toHaveBeenCalledTimes(1)
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:auth-file")
    expectNoLegacyRequests()
  })

  it("refreshes usage only for auth files with usage_available and merges the returned summary", async () => {
    await renderApp(root)

    await act(async () => {
      findButton(container, "Query all usage").click()
      await flushEffects()
    })

    const usageRefreshUrls = getRequestedUrls().filter((url) => url.endsWith("/usage"))
    const backupRow = findAuthFileRow(container, "backup-codex.json")

    expect(usageRefreshUrls).toEqual([
      managementUrl("/auth-files/primary-codex.json/usage"),
      managementUrl("/auth-files/backup-codex.json/usage"),
    ])
    expect(backupRow.textContent).toContain("Plan")
    expect(backupRow.textContent).toContain("team")
    expect(backupRow.textContent).toContain("5-hour Usage")
    expect(backupRow.textContent).toContain("Weekly Usage")
    expect(backupRow.textContent).toContain("Code Review Usage")
    expect(backupRow.textContent).toContain("Credits")
    expect(backupRow.textContent).toContain("No credits")
    expect(backupRow.querySelectorAll('[data-slot="auth-usage-bar"]')).toHaveLength(3)
    expectNoLegacyRequests()
  })

  it("starts oauth on the selected backend and polls the oauth session resource", async () => {
    vi.useFakeTimers()
    oauthSessionStatuses = [
      {
        status: "pending",
        provider: "codex",
        state: "oauth-state-1",
      },
      {
        status: "complete",
        provider: "codex",
        state: "oauth-state-1",
        auth_file: "callback-codex.json",
      },
    ]

    await renderApp(root)

    await act(async () => {
      findButton(container, "Start OAuth").click()
      await flushEffects()
    })

    expect(getJsonRequestBodies(managementUrl("/oauth-sessions"), "POST")).toContainEqual({
      provider: "codex",
    })
    expect(getRequestedUrls()).toContain(managementUrl("/oauth-sessions/oauth-state-1"))
    expect(openMock).toHaveBeenCalledWith("https://auth.example/codex/start", "_blank")
    expect(container.textContent).toContain("Waiting for browser confirmation")
    expect(findInput(container, "Pasted OAuth callback URL").value).toBe("")

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await flushEffects()
      await flushEffects()
    })

    expect(getMatchingRequests(managementUrl("/oauth-sessions/oauth-state-1/callback"), "POST")).toHaveLength(0)
    expect(container.textContent).toContain("OAuth session connected: callback-codex.json")
    expect(container.querySelector('input[aria-label="Pasted OAuth callback URL"]')).toBeNull()
    expectNoLegacyRequests()
  })

  it("submits a pasted oauth callback url and resolves success through the shared status refresh", async () => {
    oauthSessionStatuses = [
      {
        status: "pending",
        provider: "codex",
        state: "oauth-state-1",
      },
      {
        status: "complete",
        provider: "codex",
        state: "oauth-state-1",
        auth_file: "manual-callback-codex.json",
      },
    ]

    await renderApp(root)

    await act(async () => {
      findButton(container, "Start OAuth").click()
      await flushEffects()
    })

    const pastedCallbackUrl = "https://frontend.example/callback?state=oauth-state-1&code=manual-code"

    await act(async () => {
      setInputValue(findInput(container, "Pasted OAuth callback URL"), pastedCallbackUrl)
      await flushEffects()
    })

    await act(async () => {
      findButton(container, "Submit callback").click()
      await flushEffects()
    })

    expect(getJsonRequestBodies(managementUrl("/oauth-sessions/oauth-state-1/callback"), "POST")).toContainEqual({
      redirect_url: pastedCallbackUrl,
    })
    expect(getMatchingRequests(managementUrl("/oauth-sessions/oauth-state-1"), "GET")).toHaveLength(2)
    expect(container.textContent).toContain("OAuth session connected: manual-callback-codex.json")
    expect(container.querySelector('input[aria-label="Pasted OAuth callback URL"]')).toBeNull()
    expectNoLegacyRequests()
  })

  it("submits a pasted oauth error callback url and surfaces the shared status error", async () => {
    oauthSessionStatuses = [
      {
        status: "pending",
        provider: "codex",
        state: "oauth-state-1",
      },
      {
        status: "error",
        provider: "codex",
        state: "oauth-state-1",
        error: "OAuth callback rejected by provider",
      },
    ]

    await renderApp(root)

    await act(async () => {
      findButton(container, "Start OAuth").click()
      await flushEffects()
    })

    const pastedErrorCallbackUrl = "https://frontend.example/callback?state=oauth-state-1&error=access_denied"

    await act(async () => {
      setInputValue(findInput(container, "Pasted OAuth callback URL"), pastedErrorCallbackUrl)
      await flushEffects()
    })

    await act(async () => {
      findButton(container, "Submit callback").click()
      await flushEffects()
    })

    expect(getJsonRequestBodies(managementUrl("/oauth-sessions/oauth-state-1/callback"), "POST")).toContainEqual({
      redirect_url: pastedErrorCallbackUrl,
    })
    expect(getMatchingRequests(managementUrl("/oauth-sessions/oauth-state-1"), "GET")).toHaveLength(2)
    expect(container.textContent).toContain("OAuth callback rejected by provider")
    expect(container.querySelector('input[aria-label="Pasted OAuth callback URL"]')).toBeNull()
    expectNoLegacyRequests()
  })

  it("keeps polling while the oauth session remains pending on the selected backend", async () => {
    vi.useFakeTimers()
    oauthSessionStatuses = [
      {
        status: "pending",
        provider: "codex",
        state: "oauth-state-1",
      },
      {
        status: "pending",
        provider: "codex",
        state: "oauth-state-1",
      },
      {
        status: "complete",
        provider: "codex",
        state: "oauth-state-1",
        auth_file: "callback-codex.json",
      },
    ]

    await renderApp(root)

    await act(async () => {
      findButton(container, "Start OAuth").click()
      await flushEffects()
    })

    expect(getMatchingRequests(managementUrl("/oauth-sessions/oauth-state-1"), "GET")).toHaveLength(1)
    expect(container.textContent).toContain("Waiting for browser confirmation")

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await flushEffects()
    })

    expect(getMatchingRequests(managementUrl("/oauth-sessions/oauth-state-1"), "GET")).toHaveLength(2)
    expect(container.textContent).toContain("Waiting for browser confirmation")

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await flushEffects()
    })

    expect(getMatchingRequests(managementUrl("/oauth-sessions/oauth-state-1"), "GET")).toHaveLength(3)
    expect(container.textContent).toContain("OAuth session connected: callback-codex.json")
  })

  it("shows an error when the browser blocks the oauth popup", async () => {
    openMock.mockReturnValue(null)

    await renderApp(root)

    await act(async () => {
      findButton(container, "Start OAuth").click()
      await flushEffects()
    })

    expect(container.textContent).toContain("Browser blocked the OAuth popup")
    expect(container.textContent).not.toContain("Waiting for browser confirmation")
    expectNoLegacyRequests()
  })

  it("treats /auth/callback as a normal app route instead of a frontend-owned oauth completion page", async () => {
    window.history.pushState({}, "", "/auth/callback?state=oauth-state-1&code=auth-code")

    await renderApp(root)

    expect(getRequestedUrls()).toContain(managementUrl("/runtime-settings"))
    expect(getRequestedUrls()).toContain(managementUrl("/api-keys"))
    expect(getRequestedUrls()).toContain(managementUrl("/auth-files"))
    expect(getRequestedUrls().some((url) => url.endsWith("/callback"))).toBe(false)
    expect(container.textContent).toContain("API Keys")
    expect(container.textContent).not.toContain("Frontend-owned OAuth callback")
    expectNoLegacyRequests()
  })

  it("reloads against a new backend origin and stops stale oauth polling when the selector switches backends", async () => {
    vi.useFakeTimers()
    oauthSessionStatuses = [
      {
        status: "pending",
        provider: "codex",
        state: "oauth-state-1",
      },
      {
        status: "pending",
        provider: "codex",
        state: "oauth-state-1",
      },
    ]

    await renderApp(root)

    await act(async () => {
      findButton(container, "Start OAuth").click()
      await flushEffects()
    })

    expect(getMatchingRequests(managementUrl("/oauth-sessions/oauth-state-1"), "GET")).toHaveLength(1)

    await renderApp(root, SECONDARY_BACKEND_ORIGIN)

    expect(getRequestedUrls()).toContain(managementUrl("/runtime-settings", SECONDARY_BACKEND_ORIGIN))
    expect(getRequestedUrls()).toContain(managementUrl("/api-keys", SECONDARY_BACKEND_ORIGIN))
    expect(getRequestedUrls()).toContain(managementUrl("/auth-files", SECONDARY_BACKEND_ORIGIN))

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await flushEffects()
    })

    expect(getMatchingRequests(managementUrl("/oauth-sessions/oauth-state-1"), "GET")).toHaveLength(1)
    expect(getMatchingRequests(managementUrl("/oauth-sessions/oauth-state-1", SECONDARY_BACKEND_ORIGIN), "GET")).toHaveLength(0)
  })

  it("updates the configuration selector from scroll position with api keys as the first section", async () => {
    await renderApp(root)

    const apiKeysButton = findButton(container, "API Keys")
    const runtimeButton = findButton(container, "Runtime Settings")
    const apiKeysSection = container.querySelector("#api-keys")
    const runtimeSection = container.querySelector("#runtime")
    const authFilesSection = container.querySelector("#auth-files")

    if (!apiKeysSection || !runtimeSection || !authFilesSection) {
      throw new Error("Missing dashboard sections for scroll test")
    }

    expect(apiKeysButton.getAttribute("aria-current")).toBe("page")
    expect(runtimeButton.getAttribute("aria-current")).toBeNull()

    setSectionTop(apiKeysSection, -220)
    setSectionTop(runtimeSection, 32)
    setSectionTop(authFilesSection, 540)

    await act(async () => {
      window.dispatchEvent(new Event("scroll"))
      await flushEffects()
    })

    expect(runtimeButton.getAttribute("aria-current")).toBe("page")
    expect(apiKeysButton.getAttribute("aria-current")).toBeNull()
  })
})
