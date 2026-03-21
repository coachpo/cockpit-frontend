# Cockpit Frontend

Cockpit Frontend is the React + Vite management console for the Cockpit backend. It talks to the backend management surface at `/v0/management`, sends the management key as `X-Management-Key`, and exposes the full dashboard from a single-page UI.

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

By default the app reads `import.meta.env.VITE_MANAGEMENT_API_BASE_URL` on startup. You can also leave the backend URL blank in the UI to target the current origin when the frontend is reverse proxied by Cockpit.

## Build and preview

```bash
pnpm lint
pnpm build
pnpm preview
```

The build runs `tsc -b` before `vite build`, so type drift fails the build.

## Docker image

`frontend/Dockerfile` builds the app with Node 24 and serves the compiled output from nginx.

Supported build args:

- `VITE_MANAGEMENT_API_BASE_URL`
- `VITE_GIT_RUN_NUMBER`
- `VITE_GIT_REVISION`

`frontend/nginx.conf` keeps SPA routing alive with `try_files $uri $uri/ /index.html`.

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
- `src/App.css` and `src/assets/` are leftover template artifacts and are not the primary styling path for the current dashboard.
