# Cockpit Frontend

Cockpit Frontend is the React + Vite management console for the Cockpit backend. It can be served independently from the backend, lets the user choose a target backend origin in the UI before the dashboard loads, owns the browser-facing `/codex/callback` route for OAuth handoff, and exposes the full dashboard from a single-page UI.

## Stack

- React 19 + TypeScript
- Vite 8
- pnpm 10
- Tailwind CSS 4 (CSS-first config in `src/index.css`)
- shadcn/radix-nova UI components under `src/components/ui/`

## Development

```bash
pnpm install
pnpm dev
```

Use Node 24.x for local development. The repo declares `pnpm@10.32.1` in `package.json`, so running through Corepack keeps CI and local installs aligned.

On startup the app shows a backend instance selector and stores the chosen origin in `localStorage`, so a deployed frontend can connect to any reachable Cockpit backend. For local development, `pnpm dev` still supports same-origin proxying through `COCKPIT_LOCAL_BACKEND_URL`, which is what the repo root `start.sh` uses.

## Build and preview

```bash
pnpm test
pnpm lint
pnpm build
pnpm preview
```

The build runs `tsc -b` before `vite build`, so type drift fails the build.

## Docker image

`frontend/Dockerfile` builds the app with Node 24 and serves the compiled output from nginx.

Supported build args:

- `VITE_GIT_RUN_NUMBER`
- `VITE_GIT_REVISION`

`frontend/nginx.conf` keeps SPA routing alive with `try_files $uri $uri/ /index.html`. The built app still shows the backend-origin selector, so Docker and npm-based frontend deployments can be pointed at different backend instances at runtime without rebuilding the image.

## Source map

- `src/App.tsx` — canonical app shell and all management sections
- `src/lib/management-api.ts` — typed backend client
- `src/types/management.ts` — management request/response types and `MANAGEMENT_BASE_PATH`
- `src/components/section-card.tsx` — section layout wrapper
- `src/components/json-editor-card.tsx` — reusable JSON editor block
- `src/components/ui/` — shadcn/radix-nova primitives
- `src/index.css` — Tailwind v4 theme tokens, Geist font, dark mode

## CI

Frontend CI lives in `frontend/.github/workflows/ci.yml` and currently runs:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm build`

## Notes

- The app currently has no router and no external state library; new dashboard sections usually extend `src/App.tsx` and the shared wrappers in `src/components/`.
- `pnpm test` runs the Vitest coverage for frontend-only helpers such as the management client request behavior.
- `src/App.css` and `src/assets/` are leftover template artifacts and are not the primary styling path for the current dashboard.
