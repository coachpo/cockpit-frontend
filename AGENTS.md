# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-22T22:25:39+02:00
**Commit:** b37026f
**Branch:** main

## OVERVIEW
Cockpit Frontend is a pnpm + Vite + React 19 management console for the backend management and provider surfaces. The app is currently a single-page shell built around one large `src/App.tsx` component, a small typed management client, base-URL helper utilities, and shadcn/radix-nova UI primitives.

## HIERARCHY RULE
Read `src/AGENTS.md` for source-tree rules. Root covers setup, build, and repo-level layout; child files handle code-shape details.

## STRUCTURE
```text
./
|- src/                  # app shell, typed management client, UI primitives, shared types
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
| App shell and all management sections | `src/App.tsx` | canonical entrypoint; no router or external state library |
| Backend management client | `src/lib/management-api.ts` | wraps `/v0/management`, adds `X-Management-Key`, and normalizes error payloads |
| Management origin helpers | `src/lib/management-origin.ts` | current-origin default, localStorage key, and base-URL normalization |
| Management action gating | `src/lib/management-access.ts` | central busy-state + management-key disable rule |
| Shared management types | `src/types/management.ts` | `RuntimeSettings`, `AuthFile`, `ModelDefinition`, response shapes |
| Reusable section wrappers | `src/components/section-card.tsx`, `src/components/json-editor-card.tsx` | preferred scaffolding for new dashboard sections |
| UI primitives | `src/components/ui/` | shadcn/radix-nova components; lint rule is relaxed here only |
| Theme and Tailwind tokens | `src/index.css` | Tailwind v4 CSS-first config, Geist font, dark-mode variables |
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
- The frontend now defaults management requests to the current origin; keep backend URL overrides in the UI instead of introducing a deploy-time API base URL env.
- Keep backend calls in `src/lib/management-api.ts` instead of sprinkling raw `fetch` calls through UI components.
- Keep origin/base-url behavior in `src/lib/management-origin.ts`; do not fork separate localStorage keys or normalization helpers.
- Treat `src/components/ui/` as generated-style primitives and keep app-specific composition in `src/components/` or `src/App.tsx`.
- Tailwind config is CSS-first in `src/index.css`; do not assume a `tailwind.config.*` file exists.
- `src/App.css` and `src/assets/` are leftover template artifacts, not the canonical styling or asset path for the current dashboard.

## NOTES
- Vite dev proxy currently forwards `/v0/management`, `/v1`, `/api/provider`, and `/codex/callback` to `COCKPIT_LOCAL_BACKEND_URL`.
- Frontend CI currently runs install, lint, and build only. `pnpm test` exists locally but is not part of `.github/workflows/ci.yml` yet.
- Docker builds accept `VITE_GIT_RUN_NUMBER` and `VITE_GIT_REVISION`, then serve the built app from nginx.
