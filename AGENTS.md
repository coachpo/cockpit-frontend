# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-24T02:32:07+02:00
**Commit:** 7a4e1a2
**Branch:** main

## OVERVIEW
Cockpit Frontend is a pnpm + Vite + React 19 management console for the backend management and provider surfaces. The UI still centers on one large `src/App.tsx` shell, but startup now flows through `src/main.tsx` and `src/bootstrap/backend-selector.ts` so the dashboard can remember and switch backend origins before rendering.

## HIERARCHY RULE
Read `src/AGENTS.md` for source-tree rules. Root covers setup, build, and repo-level layout; child files handle code-shape details.

## STRUCTURE
```text
./
|- src/                  # app shell, backend-origin bootstrap, typed management client, UI primitives, shared types
|- public/               # static favicon and icons
|- .github/workflows/    # frontend-specific lint/build CI
|- package.json          # pnpm scripts and frontend dependency graph
|- components.json       # shadcn registry + alias config
|- vite.config.ts        # Vite + Tailwind plugin, `@` alias
|- Dockerfile            # node build -> nginx runtime image
|- nginx.conf            # SPA fallback for built assets
`- README.md             # human quick start for this submodule
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| App shell and all management sections | `src/App.tsx` | canonical composition hotspot; no router or external state library |
| Frontend bootstrap and backend selection | `src/main.tsx`, `src/bootstrap/backend-selector.ts`, `src/lib/backend-origin.ts` | chooses the active backend origin before mounting `App`, persists recent origins in localStorage, and reloads dashboard state on switch |
| Backend management client | `src/lib/management-api.ts` | wraps `backendOrigin + /v0/management`, normalizes error payloads, and leaves caller-supplied headers explicit |
| Auth-file helpers | `src/lib/auth-file-usage.ts`, `src/lib/auth-file-display.ts` | usage-probe request building plus auth-file label/status formatting |
| Shared management types | `src/types/management.ts` | `RuntimeSettings`, `AuthFile`, `ManagementApiCallRequest`, and response shapes |
| Reusable section wrappers | `src/components/section-card.tsx`, `src/components/json-editor-card.tsx` | preferred scaffolding for new dashboard sections |
| UI primitives | `src/components/ui/` | shadcn/radix-nova components; lint rule is relaxed here only |
| Theme and Tailwind tokens | `src/index.css` | Tailwind v4 CSS-first config, Geist font, dark-mode variables |
| Frontend tests | `src/App.test.tsx`, `src/lib/*.test.ts` | colocated Vitest coverage for the app shell and lib helpers |
| Dev/build commands | `package.json` | `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm preview` |
| Container packaging | `Dockerfile`, `nginx.conf` | build args feed Vite metadata; nginx serves SPA fallback |

## COMMANDS
```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
pnpm preview
```

## REPO-WIDE CONVENTIONS
- Use the `@/` alias for internal imports; it maps to `./src` in both Vite and TypeScript configs.
- Keep backend-origin selection and history in `src/bootstrap/backend-selector.ts` and `src/lib/backend-origin.ts`; do not recreate ad hoc storage keys or inline origin-picking state into `App.tsx`.
- Keep backend calls in `src/lib/management-api.ts` instead of sprinkling raw `fetch` calls through UI components.
- Keep management path and origin composition centralized through `createManagementClient`; do not rebuild `/v0/management` URLs inline across components.
- Keep auth-file formatting and usage-probe logic in `src/lib/auth-file-display.ts` and `src/lib/auth-file-usage.ts` instead of re-deriving it inside `App.tsx`.
- Treat `src/components/ui/` as generated-style primitives and keep app-specific composition in `src/components/` or `src/App.tsx`.
- Tailwind config is CSS-first in `src/index.css`; do not assume a `tailwind.config.*` file exists.
- `src/App.css` and `src/assets/` are leftover template artifacts, not the canonical styling or asset path for the current dashboard.

## NOTES
- Vite dev proxy still forwards same-origin `/v0/management`, `/v1`, and `/api/provider` requests to `COCKPIT_LOCAL_BACKEND_URL`, while the browser bootstrap can persist a full backend origin through `src/bootstrap/backend-selector.ts`.
- Frontend CI currently runs install, lint, and build only. `pnpm test` exists locally but is not part of `.github/workflows/ci.yml` yet.
- Docker builds accept `VITE_GIT_RUN_NUMBER` and `VITE_GIT_REVISION`, then serve the built app from nginx.
