import {
  normalizeBackendOrigin,
  readBackendOriginHistory,
  readSelectedBackendOrigin,
  saveSelectedBackendOrigin,
} from "@/lib/backend-origin"

interface BackendSelectorController {
  currentOrigin: string | null
  subscribe: (listener: (origin: string) => void) => () => void
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
  const input = getRequiredElement("backend-origin-input", HTMLInputElement)
  const select = getRequiredElement("backend-history-select", HTMLSelectElement)
  const status = getRequiredElement("backend-selector-status", HTMLParagraphElement)

  const listeners = new Set<(origin: string) => void>()
  let currentOrigin = readSelectedBackendOrigin()
  let history = readBackendOriginHistory()

  input.value = currentOrigin ?? ""
  renderHistoryOptions(select, history, currentOrigin)
  setStatusMessage(
    status,
    currentOrigin
      ? `Using saved backend ${currentOrigin}. Change it here to switch instances.`
      : "Choose the backend origin before loading the management console.",
    "default",
  )

  select.addEventListener("change", () => {
    if (select.value) {
      input.value = select.value
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }
  })

  form.addEventListener("submit", (event) => {
    event.preventDefault()

    let nextOrigin: string
    try {
      nextOrigin = normalizeBackendOrigin(input.value)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid backend origin."
      setStatusMessage(status, message, "error")
      input.focus()
      return
    }

    history = saveSelectedBackendOrigin(nextOrigin)
    currentOrigin = nextOrigin
    input.value = nextOrigin
    renderHistoryOptions(select, history, currentOrigin)
    setStatusMessage(
      status,
      `Connected to ${nextOrigin}. Switching backends reloads dashboard data and OAuth polling.`,
      "default",
    )

    listeners.forEach((listener) => {
      listener(nextOrigin)
    })
  })

  return {
    currentOrigin,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
