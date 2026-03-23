// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"

const fetchMock = vi.fn<typeof fetch>()

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

function getMatchingRequests(url: string, method?: string) {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const requestUrl = typeof input === "string" ? input : "url" in input ? input.url : input.toString()
    return requestUrl === url && (method ? init?.method === method : true)
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

      switch (`${method} ${url}`) {
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
        case "GET /v0/management/oauth-sessions/oauth-state-1": {
          const response = oauthSessionStatuses.shift() ?? {
            status: "complete",
            provider: "codex",
            state: "oauth-state-1",
            auth_file: "callback-codex.json",
          }
          return jsonResponse(response)
        }
        case "POST /v0/management/oauth-sessions/oauth-state-1/callback":
          return jsonResponse({
            status: "ok",
            auth_file: "callback-codex.json",
          })
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
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    const requestedUrls = getRequestedUrls()

    expect(requestedUrls).toContain("/v0/management/runtime-settings")
    expect(requestedUrls).toContain("/v0/management/api-keys")
    expect(requestedUrls).toContain("/v0/management/auth-files")
    expect(container.querySelector("#codex-keys")).toBeNull()
    expect(container.textContent).toContain("API Keys")
    expect(container.textContent).toContain("Runtime Settings")
    expect(container.textContent).toContain("Auth Files")
    expect(container.textContent).not.toContain("Codex Keys")
    expect(container.textContent).toContain("Usage-ready files")
    expectNoLegacyRequests()
  })

  it("saves api keys and runtime settings through the redesigned aggregate endpoints", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    await act(async () => {
      findButton(container, "Save Keys").click()
      await flushEffects()
    })

    await act(async () => {
      findButton(container, "Apply Changes").click()
      await flushEffects()
    })

    expect(getJsonRequestBodies("/v0/management/api-keys", "PUT")).toContainEqual({
      items: ["sk-primary", "sk-backup"],
    })
    expect(getJsonRequestBodies("/v0/management/runtime-settings", "PUT")).toContainEqual({
      "ws-auth": false,
      "request-retry": 3,
      "max-retry-interval": 30,
      "routing-strategy": "round-robin",
      "switch-project": true,
    })
    expectNoLegacyRequests()
  })

  it("uses path-based auth-file actions for usage refresh, download, and patch mutations", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

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

    expect(getRequestedUrls()).toContain("/v0/management/auth-files/primary-codex.json/usage")
    expect(getRequestedUrls()).toContain("/v0/management/auth-files/primary-codex.json/content")
    expect(getJsonRequestBodies("/v0/management/auth-files/primary-codex.json", "PATCH")).toEqual([
      { priority: 0 },
      { disabled: true },
    ])
    expect(anchorClickMock).toHaveBeenCalledTimes(1)
    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:auth-file")
    expectNoLegacyRequests()
  })

  it("refreshes usage only for auth files with usage_available and merges the returned summary", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    await act(async () => {
      findButton(container, "Query all usage").click()
      await flushEffects()
    })

    const usageRefreshUrls = getRequestedUrls().filter((url) => url.endsWith("/usage"))
    const backupRow = findAuthFileRow(container, "backup-codex.json")

    expect(usageRefreshUrls).toEqual([
      "/v0/management/auth-files/primary-codex.json/usage",
      "/v0/management/auth-files/backup-codex.json/usage",
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

  it("starts oauth with frontend callback origin and polls the oauth session resource", async () => {
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

    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    await act(async () => {
      findButton(container, "Start OAuth").click()
      await flushEffects()
    })

    expect(getJsonRequestBodies("/v0/management/oauth-sessions", "POST")).toContainEqual({
      provider: "codex",
      callback_origin: window.location.origin,
    })
    expect(getRequestedUrls()).toContain("/v0/management/oauth-sessions/oauth-state-1")
    expect(openMock).toHaveBeenCalledWith("https://auth.example/codex/start", "_blank")
    expect(container.textContent).toContain("Waiting for browser confirmation")

    await act(async () => {
      vi.advanceTimersByTime(2000)
      await flushEffects()
      await flushEffects()
    })

    expect(container.textContent).toContain("OAuth session connected: callback-codex.json")
    expectNoLegacyRequests()
  })

  it("shows an error when the browser blocks the oauth popup", async () => {
    openMock.mockReturnValue(null)

    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    await act(async () => {
      findButton(container, "Start OAuth").click()
      await flushEffects()
    })

    expect(container.textContent).toContain("Browser blocked the OAuth popup")
    expect(container.textContent).not.toContain("Waiting for browser confirmation")
    expectNoLegacyRequests()
  })

  it("owns /codex/callback in the frontend shell and forwards callback data to the oauth session callback endpoint", async () => {
    window.history.pushState({}, "", "/codex/callback?state=oauth-state-1&code=auth-code")

    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    expect(getRequestedUrls()).toEqual([
      "/v0/management/oauth-sessions/oauth-state-1/callback",
    ])
    expect(getJsonRequestBodies("/v0/management/oauth-sessions/oauth-state-1/callback", "POST")).toEqual([
      {
        provider: "codex",
        state: "oauth-state-1",
        redirect_url: window.location.href,
        code: "auth-code",
      },
    ])
    expect(container.textContent).toContain("Frontend-owned OAuth callback")
    expect(container.textContent).toContain("Authentication linked to callback-codex.json")
    expect(container.textContent).not.toContain("API Keys")
    expectNoLegacyRequests()
  })

  it("updates the configuration selector from scroll position with api keys as the first section", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

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
