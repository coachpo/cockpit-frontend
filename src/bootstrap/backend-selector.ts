import {
  normalizeBackendOrigin,
  readBackendOriginHistory,
  readSelectedBackendOrigin,
  saveSelectedBackendOrigin,
} from "@/lib/backend-origin"

export interface BackendSelection {
  backendOrigin: string
  managementPassword: string
}

interface BackendSelectorController {
  readonly currentSelection: BackendSelection | null
  subscribe: (listener: (selection: BackendSelection) => void) => () => void
}

function getRequiredElement<T extends HTMLElement>(
  id: string,
  expectedType: { new (): T },
): T {
  const element = document.getElementById(id)
  if (!(element instanceof expectedType)) {
    throw new Error(`Missing required backend selector element: #${id}`)
  }

  return element
}

function renderHistoryOptions(
  select: HTMLSelectElement,
  origins: string[],
  selectedOrigin: string | null,
) {
  select.replaceChildren()

  const placeholder = document.createElement("option")
  placeholder.value = ""
  placeholder.textContent = origins.length ? "Recent backends" : "No saved backends yet"
  select.appendChild(placeholder)

  origins.forEach((origin) => {
    const option = document.createElement("option")
    option.value = origin
    option.textContent = origin
    select.appendChild(option)
  })

  select.disabled = origins.length === 0
  select.value = selectedOrigin && origins.includes(selectedOrigin) ? selectedOrigin : ""
}

function setStatusMessage(status: HTMLElement, message: string, tone: "default" | "error") {
  status.textContent = message
  status.className =
    tone === "error"
      ? "text-sm leading-relaxed text-destructive"
      : "text-sm leading-relaxed text-muted-foreground"
}

export function setupBackendSelector(): BackendSelectorController {
  const form = getRequiredElement("backend-selector-form", HTMLFormElement)
  const originInput = getRequiredElement("backend-origin-input", HTMLInputElement)
  const passwordInput = getRequiredElement("management-password-input", HTMLInputElement)
  const select = getRequiredElement("backend-history-select", HTMLSelectElement)
  const status = getRequiredElement("backend-selector-status", HTMLParagraphElement)

  const listeners = new Set<(selection: BackendSelection) => void>()
  const savedOrigin = readSelectedBackendOrigin()
  let currentSelection: BackendSelection | null = null
  let history = readBackendOriginHistory()

  originInput.value = savedOrigin ?? ""
  passwordInput.value = ""
  renderHistoryOptions(select, history, savedOrigin)
  setStatusMessage(
    status,
    savedOrigin
      ? `Using saved backend ${savedOrigin} as a starting point. Enter the management password and connect before loading the console.`
      : "Choose the backend origin and enter the management password before loading the management console.",
    "default",
  )

  select.addEventListener("change", () => {
    if (select.value) {
      originInput.value = select.value
      originInput.focus()
      originInput.setSelectionRange(originInput.value.length, originInput.value.length)
    }
  })

  form.addEventListener("submit", (event) => {
    event.preventDefault()

    let nextOrigin: string
    try {
      nextOrigin = normalizeBackendOrigin(originInput.value)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid backend origin."
      setStatusMessage(status, message, "error")
      originInput.focus()
      return
    }

    const nextPassword = passwordInput.value.trim()
    if (nextPassword === "") {
      setStatusMessage(
        status,
        "Enter the management password before connecting to the backend management API.",
        "error",
      )
      passwordInput.focus()
      return
    }

    const nextSelection: BackendSelection = {
      backendOrigin: nextOrigin,
      managementPassword: nextPassword,
    }

    history = saveSelectedBackendOrigin(nextOrigin)
    currentSelection = nextSelection
    originInput.value = nextOrigin
    passwordInput.value = nextPassword
    renderHistoryOptions(select, history, nextOrigin)
    setStatusMessage(
      status,
      `Connected to ${nextOrigin}. Switching backends reloads dashboard data and OAuth polling. The management password stays in memory for this browser session only.`,
      "default",
    )

    listeners.forEach((listener) => {
      listener(nextSelection)
    })
  })

  return {
    get currentSelection() {
      return currentSelection
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
