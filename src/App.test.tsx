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

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
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

describe("App", () => {
  let container: HTMLDivElement
  let root: Root
  let openMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)

    ;(
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean
      }
    ).IS_REACT_ACT_ENVIRONMENT = true

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

    fetchMock.mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : "url" in input ? input.url : input.toString()

      switch (url) {
        case "/v0/management/ws-auth":
          return jsonResponse({ "ws-auth": false })
        case "/v0/management/request-retry":
          return jsonResponse({ "request-retry": 3 })
        case "/v0/management/max-retry-interval":
          return jsonResponse({ "max-retry-interval": 30 })
        case "/v0/management/routing/strategy":
          return jsonResponse({ strategy: "round-robin" })
        case "/v0/management/quota-exceeded/switch-project":
          return jsonResponse({ "switch-project": true })
        case "/v0/management/api-keys":
          return jsonResponse({ "api-keys": ["sk-primary", "sk-backup"] })
        case "/v0/management/codex-api-key":
          return jsonResponse({
            "codex-api-key": [
              {
                "api-key": "sk-codex-primary",
                "base-url": "https://api.openai.com/v1",
                priority: 1,
              },
            ],
          })
        case "/v0/management/model-definitions/codex":
          return jsonResponse({
            channel: "codex",
            models: [
              {
                id: "gpt-5",
                display_name: "GPT-5",
                version: "2026.03",
                description: "Flagship reasoning model",
                context_length: 400000,
                max_completion_tokens: 128000,
                supported_parameters: ["temperature", "reasoning_effort"],
                thinking: { levels: ["low", "medium", "high"] },
              },
              {
                id: "gpt-5-codex-mini",
                display_name: "GPT-5 Codex Mini",
                version: "2026.03",
                description: "Fast coding assistant",
                context_length: 256000,
                max_completion_tokens: 64000,
                supported_parameters: ["temperature"],
                thinking: { levels: ["low", "max"] },
              },
            ],
          })
        case "/v0/management/auth-files":
          return jsonResponse({
            files: [
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
                usage: {
                  limits: [
                    {
                      label: "Messages",
                      percentage: 0.25,
                      used: "10 / 40",
                    },
                  ],
                },
                usage_probe: {
                  authIndex: "primary-usage-probe",
                  method: "POST",
                  url: "https://chatgpt.com/backend-api/wham/usage",
                  header: {
                    Authorization: "Bearer $TOKEN$",
                    "Content-Type": "application/json",
                  },
                  body: {
                    source: "dashboard",
                  },
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
                usage_probe: {
                  authIndex: "backup-usage-probe",
                  method: "GET",
                  url: "https://chatgpt.com/backend-api/wham/usage/backup",
                },
              },
              {
                id: "auth-manual",
                name: "manual-codex.json",
                provider: "codex",
                email: "manual@example.com",
                label: "Manual Seat",
                status: "active",
                status_message: "Imported without usage probe",
                priority: 4,
                disabled: false,
                source: "file",
              },
            ],
          })
        case "/v0/management/codex-auth-url?is_webui=true":
          return jsonResponse({
            status: "ok",
            url: "https://auth.example/codex/start",
            state: "oauth-state-1",
          })
        case "/v0/management/get-auth-status?state=oauth-state-1":
          return jsonResponse({ status: "wait" })
      }

      if (url === "/v0/management/auth-files/fields" && init?.method === "PATCH") {
        return jsonResponse({ status: "ok" })
      }

        if (url === "/v0/management/auth-files/status" && init?.method === "PATCH") {
          return jsonResponse({ status: "ok", disabled: true })
        }

        if (url === "/v0/management/api-call" && init?.method === "POST") {
          const body = JSON.parse(String(init.body ?? "{}")) as {
            authIndex?: string
            url?: string
          }

          if (body.authIndex === "primary-usage-probe") {
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
          }

          if (body.authIndex === "backup-usage-probe") {
            return jsonResponse({
              status_code: 200,
              header: {
                "content-type": ["application/json"],
              },
              body: JSON.stringify({
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
                  secondary_window: null,
                },
                credits: {
                  has_credits: false,
                  unlimited: false,
                  balance: null,
                },
              }),
            })
          }

          return new Response(`Unexpected usage probe: ${body.url ?? "unknown"}`, { status: 404 })
        }

        return new Response(`Unexpected URL: ${url}`, { status: 404 })
      })

    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    container.remove()
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it("auto-loads the dashboard and renders the codex model catalog as metadata-rich cards", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    const requestedUrls = getRequestedUrls()
    expect(requestedUrls).toContain("/v0/management/ws-auth")
    expect(requestedUrls).toContain("/v0/management/model-definitions/codex")
    expect(requestedUrls).toContain("/v0/management/auth-files")

    const pageText = container.textContent ?? ""
    expect(pageText).toContain("Model Catalog")
    expect(pageText).toContain("GPT-5")
    expect(pageText).toContain("GPT-5 Codex Mini")
    expect(pageText).toContain("temperature")
    expect(pageText).toContain("reasoning_effort")
    expect(pageText).toContain("low")
    expect(pageText).toContain("max")
    expect(pageText).not.toContain("Load catalog")

    const modelCatalogSection = container.querySelector("#model-catalog")
    expect(modelCatalogSection?.querySelector("textarea")).toBeNull()
  })

  it("shows redacted Codex Keys examples for opencode and codex_cli_rs headers", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    const codexKeysSection = container.querySelector("#codex-keys")

    expect(codexKeysSection?.textContent).toContain('"api-key": "[REDACTED]"')
    expect(codexKeysSection?.textContent).toContain('"base-url": "https://[REDACTED]"')
    expect(codexKeysSection?.textContent).toContain('"originator": "opencode"')
    expect(codexKeysSection?.textContent).toContain('opencode/1.3.0 (darwin 25.3.0; arm64) ai-sdk/provider-utils/3.0.20 runtime/bun/1.3.10')
    expect(codexKeysSection?.textContent).toContain('"originator": "codex_cli_rs"')
    expect(codexKeysSection?.textContent).toContain('codex_cli_rs/0.116.0 (Mac OS 26.3.1; arm64) Apple_Terminal/466')
  })

  it("places API Keys on its own full-width row before a stacked full-width model catalog", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    const apiKeysSection = container.querySelector("#api-keys")
    const modelCatalogSection = container.querySelector("#model-catalog")

    if (!apiKeysSection || !modelCatalogSection) {
      throw new Error("Missing API Keys or Model Catalog section")
    }

    const sharedLayout = apiKeysSection.parentElement
    const siblingSectionIds = Array.from(sharedLayout?.children ?? [])
      .map((element) => (element instanceof HTMLElement ? element.id : ""))
      .filter(Boolean)

    expect(sharedLayout).toBe(modelCatalogSection.parentElement)
    expect(siblingSectionIds).toEqual(["api-keys", "model-catalog"])

    const firstModelCard = modelCatalogSection.querySelector("article")
    const modelList = firstModelCard?.parentElement

    expect(firstModelCard).not.toBeNull()
    expect(Array.from(modelList?.children ?? [])).toHaveLength(2)
    expect(Array.from(modelList?.children ?? []).every((child) => child.tagName === "ARTICLE")).toBe(true)
  })

  it("keeps OAuth actions but removes the idle badge and explanatory copy", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    expect(container.textContent).toContain("OAuth")
    expect(container.textContent).toContain("owner@example.com")
    expect(container.textContent).not.toContain("Restore browser-based Codex sign-in without changing the app’s authless same-origin runtime.")
    expect(container.textContent).not.toContain("OAuth is idle until you start a new browser flow.")
    expect(container.textContent).not.toContain("Open a fresh browser sign-in flow when you need to reconnect a Codex session.")
    expect(container.textContent).not.toContain("Start OAuth to open the browser sign-in flow.")
    expect(container.textContent).not.toContain("idle")

    const startOAuthButton = findButton(container, "Start OAuth")
    await act(async () => {
      startOAuthButton.click()
      await flushEffects()
    })

    expect(getRequestedUrls()).toContain("/v0/management/codex-auth-url?is_webui=true")
    expect(getRequestedUrls()).toContain("/v0/management/get-auth-status?state=oauth-state-1")
    expect(openMock).toHaveBeenCalledWith("https://auth.example/codex/start", "_blank")
    expect(container.textContent).toContain("Waiting for browser confirmation")

    const saveDetailsButton = findButton(container, "Save details")
    await act(async () => {
      saveDetailsButton.click()
      await flushEffects()
    })

    const fieldsRequest = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : "url" in input ? input.url : input.toString()
      return url === "/v0/management/auth-files/fields" && init?.method === "PATCH"
    })

    expect(fieldsRequest).toBeDefined()
    expect(fieldsRequest?.[1]?.body).toBe(
      JSON.stringify({
        name: "primary-codex.json",
        priority: 0,
      }),
    )

    const disableButton = findButton(container, "Disable auth file")
    await act(async () => {
      disableButton.click()
      await flushEffects()
    })

    const statusRequest = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : "url" in input ? input.url : input.toString()
      return url === "/v0/management/auth-files/status" && init?.method === "PATCH"
    })

    expect(statusRequest).toBeDefined()
    expect(statusRequest?.[1]?.body).toBe(
      JSON.stringify({
        name: "primary-codex.json",
        disabled: true,
      }),
    )
  })

  it("posts a single auth file usage probe to the restored api-call route and merges the response into the compact row", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    const primaryRow = findAuthFileRow(container, "primary-codex.json")
    expect(primaryRow.textContent).toContain("Messages")
    expect(primaryRow.textContent).toContain("10 / 40")

    await act(async () => {
      findButton(primaryRow, "Query usage").click()
      await flushEffects()
    })

    expect(getJsonRequestBodies("/v0/management/api-call", "POST")).toContainEqual({
      authIndex: "primary-usage-probe",
      method: "POST",
      url: "https://chatgpt.com/backend-api/wham/usage",
      header: {
        Authorization: "Bearer $TOKEN$",
        "Content-Type": "application/json",
      },
      body: {
        source: "dashboard",
      },
    })
    expect(primaryRow.textContent).toContain("12 / 40")
    expect(primaryRow.textContent).toContain("tomorrow 09:00 UTC")
  })

  it("queries usage for every probe-capable auth file from the section-level action", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    await act(async () => {
      findButton(container, "Query all usage").click()
      await flushEffects()
    })

    expect(getJsonRequestBodies("/v0/management/api-call", "POST")).toEqual([
      {
        authIndex: "primary-usage-probe",
        method: "POST",
        url: "https://chatgpt.com/backend-api/wham/usage",
        header: {
          Authorization: "Bearer $TOKEN$",
          "Content-Type": "application/json",
        },
        body: {
          source: "dashboard",
        },
      },
      {
        authIndex: "backup-usage-probe",
        method: "GET",
        url: "https://chatgpt.com/backend-api/wham/usage/backup",
      },
    ])

    const backupRow = findAuthFileRow(container, "backup-codex.json")
    const usageBars = backupRow.querySelectorAll('[data-slot="auth-usage-bar"]')

    expect(backupRow.textContent).toContain("Plan")
    expect(backupRow.textContent).toContain("team")
    expect(backupRow.textContent).toContain("Usages")
    expect(backupRow.textContent).toContain("5-hour Usage")
    expect(backupRow.textContent).toContain("30%")
    expect(backupRow.textContent).toContain("resets in 4h")
    expect(backupRow.textContent).toContain("Weekly Usage")
    expect(backupRow.textContent).toContain("100%")
    expect(backupRow.textContent).toContain("resets in 5d")
    expect(backupRow.textContent).toContain("Code Review Usage")
    expect(backupRow.textContent).toContain("82%")
    expect(backupRow.textContent).toContain("resets in 7d")
    expect(backupRow.textContent).not.toContain("Core access")
    expect(backupRow.textContent).not.toContain("Review access")
    expect(usageBars).toHaveLength(3)
    expect(backupRow.textContent).toContain("Credits")
    expect(backupRow.textContent).toContain("No credits")
  })

  it("renders auth files without models, prefix, or note fields while keeping priority editing", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    const primaryRow = findAuthFileRow(container, "primary-codex.json")
    const manualRow = findAuthFileRow(container, "manual-codex.json")

    expect(primaryRow.textContent).toContain("Messages")
    expect(findButton(manualRow, "Query usage").disabled).toBe(true)
    expect(primaryRow.textContent).not.toContain("Registered models")
    expect(primaryRow.textContent).not.toContain("View file models")
    expect(primaryRow.textContent).not.toContain("Prefix")
    expect(primaryRow.textContent).not.toContain("Note")
    expect(primaryRow.querySelector('input[aria-label="Priority for primary-codex.json"]')).not.toBeNull()
  })

  it("renders one stacked usage list with human-readable labels", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    await act(async () => {
      findButton(container, "Query all usage").click()
      await flushEffects()
    })

    const backupRow = findAuthFileRow(container, "backup-codex.json")
    expect(backupRow.textContent).toContain("Usages")
    expect(backupRow.textContent).toContain("5-hour Usage")
    expect(backupRow.textContent).toContain("Weekly Usage")
    expect(backupRow.textContent).toContain("Code Review Usage")
    expect(backupRow.textContent).not.toContain("Core access")
    expect(backupRow.textContent).not.toContain("Review access")
    expect(backupRow.textContent).not.toContain("Core 5h")
    expect(backupRow.textContent).not.toContain("Core 7d")
    expect(backupRow.textContent).not.toContain("Review 7d")
    expect(backupRow.textContent).not.toContain("Blocked")
    expect(backupRow.textContent).not.toContain("Allowed")
    expect(backupRow.textContent).not.toContain("Almost used")
    expect(backupRow.querySelectorAll('[data-slot="auth-usage-ring"]')).toHaveLength(0)
    expect(backupRow.querySelectorAll('[data-slot="auth-usage-bar"]')).toHaveLength(3)
  })

  it("updates the configuration selector using section visibility", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    const codexKeysButton = findButton(container, "Codex Keys")
    const runtimeButton = findButton(container, "Runtime Settings")

    expect(codexKeysButton.getAttribute("aria-current")).toBe("page")
    expect(runtimeButton.getAttribute("aria-current")).toBeNull()

    const runtimeSection = container.querySelector("#runtime")
    const observer = MockIntersectionObserver.instances[0]

    expect(observer).toBeDefined()
    expect(runtimeSection).not.toBeNull()

    await act(async () => {
      observer?.trigger([{ target: runtimeSection as Element, isIntersecting: true }])
      await flushEffects()
    })

    expect(runtimeButton.getAttribute("aria-current")).toBe("page")
    expect(codexKeysButton.getAttribute("aria-current")).toBeNull()
  })

  it("updates the configuration selector from live scroll position changes", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    const codexKeysButton = findButton(container, "Codex Keys")
    const runtimeButton = findButton(container, "Runtime Settings")
    const codexSection = container.querySelector("#codex-keys")
    const modelCatalogSection = container.querySelector("#model-catalog")
    const apiKeysSection = container.querySelector("#api-keys")
    const runtimeSection = container.querySelector("#runtime")
    const authFilesSection = container.querySelector("#auth-files")

    if (!codexSection || !modelCatalogSection || !apiKeysSection || !runtimeSection || !authFilesSection) {
      throw new Error("Missing dashboard sections for scroll test")
    }

    setSectionTop(codexSection, -920)
    setSectionTop(modelCatalogSection, -420)
    setSectionTop(apiKeysSection, -160)
    setSectionTop(runtimeSection, 88)
    setSectionTop(authFilesSection, 820)

    expect(codexKeysButton.getAttribute("aria-current")).toBe("page")
    expect(runtimeButton.getAttribute("aria-current")).toBeNull()

    await act(async () => {
      window.dispatchEvent(new Event("scroll"))
      await flushEffects()
    })

    expect(runtimeButton.getAttribute("aria-current")).toBe("page")
    expect(codexKeysButton.getAttribute("aria-current")).toBeNull()
  })

  it("switches from API Keys to Model Catalog as the stacked sections scroll past the anchor", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    const apiKeysButton = findButton(container, "API Keys")
    const modelCatalogButton = findButton(container, "Model Catalog")
    const codexSection = container.querySelector("#codex-keys")
    const modelCatalogSection = container.querySelector("#model-catalog")
    const apiKeysSection = container.querySelector("#api-keys")
    const runtimeSection = container.querySelector("#runtime")
    const authFilesSection = container.querySelector("#auth-files")

    if (!codexSection || !modelCatalogSection || !apiKeysSection || !runtimeSection || !authFilesSection) {
      throw new Error("Missing dashboard sections for stacked-row selector test")
    }

    await act(async () => {
      apiKeysButton.click()
      await flushEffects()
    })

    expect(apiKeysButton.getAttribute("aria-current")).toBe("page")

    setSectionTop(codexSection, -920)
    setSectionTop(apiKeysSection, -220)
    setSectionTop(modelCatalogSection, 32)
    setSectionTop(runtimeSection, 540)
    setSectionTop(authFilesSection, 940)

    await act(async () => {
      window.dispatchEvent(new Event("scroll"))
      await flushEffects()
    })

    expect(modelCatalogButton.getAttribute("aria-current")).toBe("page")
    expect(apiKeysButton.getAttribute("aria-current")).toBeNull()
  })

  it("selects the final section when the viewport reaches the document bottom", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    const runtimeButton = findButton(container, "Runtime Settings")
    const authFilesButton = findButton(container, "Auth Files")
    const codexSection = container.querySelector("#codex-keys")
    const modelCatalogSection = container.querySelector("#model-catalog")
    const apiKeysSection = container.querySelector("#api-keys")
    const runtimeSection = container.querySelector("#runtime")
    const authFilesSection = container.querySelector("#auth-files")

    if (!codexSection || !modelCatalogSection || !apiKeysSection || !runtimeSection || !authFilesSection) {
      throw new Error("Missing dashboard sections for bottom-of-page scroll test")
    }

    setViewportPosition({
      scrollY: 1220,
      innerHeight: 760,
      scrollHeight: 1980,
    })

    setSectionTop(codexSection, -1200)
    setSectionTop(modelCatalogSection, -620)
    setSectionTop(apiKeysSection, -260)
    setSectionTop(runtimeSection, 55)
    setSectionTop(authFilesSection, 582)

    expect(runtimeButton.getAttribute("aria-current")).toBeNull()
    expect(authFilesButton.getAttribute("aria-current")).toBeNull()

    await act(async () => {
      window.dispatchEvent(new Event("scroll"))
      await flushEffects()
    })

    expect(authFilesButton.getAttribute("aria-current")).toBe("page")
    expect(runtimeButton.getAttribute("aria-current")).toBeNull()
  })

  it("shows an error when the browser blocks the OAuth popup", async () => {
    openMock.mockReturnValue(null)

    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    const startOAuthButton = findButton(container, "Start OAuth")

    await act(async () => {
      startOAuthButton.click()
      await flushEffects()
    })

    expect(container.textContent).toContain("Browser blocked the OAuth popup")
    expect(container.textContent).not.toContain("Waiting for browser confirmation")
  })

  it("preserves zero-priority auth files in the UI and save payload", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    expect(container.textContent).toContain("Priority 0")

    const saveDetailsButton = findButton(container, "Save details")
    await act(async () => {
      saveDetailsButton.click()
      await flushEffects()
    })

    const fieldsRequest = fetchMock.mock.calls.find(([input, init]) => {
      const url = typeof input === "string" ? input : "url" in input ? input.url : input.toString()
      return url === "/v0/management/auth-files/fields" && init?.method === "PATCH"
    })

    expect(fieldsRequest?.[1]?.body).toBe(
      JSON.stringify({
        name: "primary-codex.json",
        priority: 0,
      }),
    )
  })
})
