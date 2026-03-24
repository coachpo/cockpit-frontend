import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { setupBackendSelector } from '@/bootstrap/backend-selector'
import './index.css'

const rootElement = document.getElementById("root")

if (!(rootElement instanceof HTMLDivElement)) {
  throw new Error("Missing #root mount element")
}

const appRootElement: HTMLDivElement = rootElement
const root = createRoot(appRootElement)
const backendSelector = setupBackendSelector()

function renderApp(backendOrigin: string) {
  appRootElement.hidden = false
  root.render(
    <StrictMode>
      <App key={backendOrigin} backendOrigin={backendOrigin} />
    </StrictMode>,
  )
}

backendSelector.subscribe((backendOrigin) => {
  renderApp(backendOrigin)
})

if (backendSelector.currentOrigin) {
  renderApp(backendSelector.currentOrigin)
}
