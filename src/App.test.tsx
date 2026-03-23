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

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(label),
  )

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Unable to find button containing text: ${label}`)
  }

  return button
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
                note: "Local fallback seat",
                prefix: "team-a",
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
        case "/v0/management/auth-files/models?name=primary-codex.json":
          return jsonResponse({
            models: [
              {
                id: "gpt-5-codex-mini",
                display_name: "GPT-5 Codex Mini",
                type: "model",
                owned_by: "openai",
              },
            ],
          })
      }

      if (url === "/v0/management/auth-files/fields" && init?.method === "PATCH") {
        return jsonResponse({ status: "ok" })
      }

      if (url === "/v0/management/auth-files/status" && init?.method === "PATCH") {
        return jsonResponse({ status: "ok", disabled: true })
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
    expect(sharedLayout?.className).not.toContain("xl:grid-cols-2")
    expect(siblingSectionIds).toEqual(["api-keys", "model-catalog"])

    const firstModelCard = modelCatalogSection.querySelector("article")
    const modelList = firstModelCard?.parentElement

    expect(firstModelCard).not.toBeNull()
    expect(modelList?.className).not.toContain("sm:grid-cols-2")
    expect(Array.from(modelList?.children ?? [])).toHaveLength(2)
    expect(Array.from(modelList?.children ?? []).every((child) => child.tagName === "ARTICLE")).toBe(true)
  })

  it("restores OAuth and auth-file management surfaces for local auth workflows", async () => {
    await act(async () => {
      root.render(<App />)
      await flushEffects()
    })

    expect(container.textContent).toContain("OAuth")
    expect(container.textContent).toContain("owner@example.com")
    expect(container.textContent).toContain("Local fallback seat")

    const startOAuthButton = findButton(container, "Start OAuth")
    await act(async () => {
      startOAuthButton.click()
      await flushEffects()
    })

    expect(getRequestedUrls()).toContain("/v0/management/codex-auth-url?is_webui=true")
    expect(getRequestedUrls()).toContain("/v0/management/get-auth-status?state=oauth-state-1")
    expect(openMock).toHaveBeenCalledWith("https://auth.example/codex/start", "_blank")
    expect(container.textContent).toContain("Waiting for browser confirmation")

    const viewModelsButton = findButton(container, "View file models")
    await act(async () => {
      viewModelsButton.click()
      await flushEffects()
    })

    expect(getRequestedUrls()).toContain("/v0/management/auth-files/models?name=primary-codex.json")
    expect(container.textContent).toContain("Models for primary-codex.json")
    expect(container.textContent).toContain("gpt-5-codex-mini")

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
        prefix: "team-a",
        priority: 0,
        note: "Local fallback seat",
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
        prefix: "team-a",
        priority: 0,
        note: "Local fallback seat",
      }),
    )
  })
})
