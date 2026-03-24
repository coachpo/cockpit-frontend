// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { saveSelectedBackendOrigin } from "@/lib/backend-origin"
import { setupBackendSelector } from "@/bootstrap/backend-selector"

function renderSelectorFixture() {
  document.body.innerHTML = `
    <form id="backend-selector-form">
      <select id="backend-history-select"></select>
      <input id="backend-origin-input" type="url" />
      <input id="management-password-input" type="password" />
      <p id="backend-selector-status"></p>
      <button id="backend-selector-submit" type="submit">Connect backend</button>
    </form>
  `
}

function getStoredValues() {
  return Array.from({ length: window.localStorage.length }, (_, index) => {
    const key = window.localStorage.key(index)
    return key ? window.localStorage.getItem(key) : null
  }).filter((value): value is string => value !== null)
}

describe("setupBackendSelector", () => {
  beforeEach(() => {
    window.localStorage.clear()
    renderSelectorFixture()
  })

  afterEach(() => {
    window.localStorage.clear()
    document.body.innerHTML = ""
  })

  it("prefills the saved backend origin without publishing a ready selection", () => {
    saveSelectedBackendOrigin("https://saved.example:9443", window.localStorage)

    const controller = setupBackendSelector()
    const originInput = document.getElementById("backend-origin-input")
    const passwordInput = document.getElementById("management-password-input")
    const status = document.getElementById("backend-selector-status")

    expect(controller.currentSelection).toBeNull()
    expect(originInput).toBeInstanceOf(HTMLInputElement)
    expect((originInput as HTMLInputElement).value).toBe("https://saved.example:9443")
    expect(passwordInput).toBeInstanceOf(HTMLInputElement)
    expect((passwordInput as HTMLInputElement).value).toBe("")
    expect(status?.textContent).toContain("Enter the management password and connect")
  })

  it("rejects submit when the management password is missing", () => {
    const controller = setupBackendSelector()
    const listener = vi.fn()
    const form = document.getElementById("backend-selector-form")
    const originInput = document.getElementById("backend-origin-input")
    const passwordInput = document.getElementById("management-password-input")
    const status = document.getElementById("backend-selector-status")

    controller.subscribe(listener)

    if (!(form instanceof HTMLFormElement)) {
      throw new Error("Missing selector form")
    }
    if (!(originInput instanceof HTMLInputElement)) {
      throw new Error("Missing backend origin input")
    }
    if (!(passwordInput instanceof HTMLInputElement)) {
      throw new Error("Missing management password input")
    }

    originInput.value = "https://backend.example:9443/api"
    passwordInput.value = "   "

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))

    expect(listener).not.toHaveBeenCalled()
    expect(controller.currentSelection).toBeNull()
    expect(document.activeElement).toBe(passwordInput)
    expect(status?.textContent).toContain("Enter the management password before connecting")
    expect(getStoredValues()).toHaveLength(0)
  })

  it("publishes the submitted backend origin and management password without persisting the password", () => {
    const controller = setupBackendSelector()
    const listener = vi.fn()
    const form = document.getElementById("backend-selector-form")
    const originInput = document.getElementById("backend-origin-input")
    const passwordInput = document.getElementById("management-password-input")

    controller.subscribe(listener)

    if (!(form instanceof HTMLFormElement)) {
      throw new Error("Missing selector form")
    }
    if (!(originInput instanceof HTMLInputElement)) {
      throw new Error("Missing backend origin input")
    }
    if (!(passwordInput instanceof HTMLInputElement)) {
      throw new Error("Missing management password input")
    }

    originInput.value = "https://backend.example:9443/api"
    passwordInput.value = "super-secret-session-password"

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))

    expect(listener).toHaveBeenCalledWith({
      backendOrigin: "https://backend.example:9443",
      managementPassword: "super-secret-session-password",
    })
    expect(controller.currentSelection).toEqual({
      backendOrigin: "https://backend.example:9443",
      managementPassword: "super-secret-session-password",
    })
    expect(getStoredValues().some((value) => value.includes("https://backend.example:9443"))).toBe(true)
    expect(getStoredValues().some((value) => value.includes("super-secret-session-password"))).toBe(false)
  })
})
