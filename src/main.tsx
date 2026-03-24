import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { setupBackendSelector, type BackendSelection } from '@/bootstrap/backend-selector'
import './index.css'

const rootElement = document.getElementById("root")

if (!(rootElement instanceof HTMLDivElement)) {
  throw new Error("Missing #root mount element")
}

const appRootElement: HTMLDivElement = rootElement
const root = createRoot(appRootElement)
const backendSelector = setupBackendSelector()
let renderRevision = 0

function renderApp(selection: BackendSelection) {
  renderRevision += 1
  appRootElement.hidden = false
  root.render(
    <StrictMode>
      <App
        key={renderRevision}
        backendOrigin={selection.backendOrigin}
        managementPassword={selection.managementPassword}
      />
    </StrictMode>,
  )
}

backendSelector.subscribe((selection) => {
  renderApp(selection)
})

if (backendSelector.currentSelection) {
  renderApp(backendSelector.currentSelection)
}
