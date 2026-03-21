# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-21T23:19:20+02:00
**Commit:** 0801e0d
**Branch:** main

## OVERVIEW
Cockpit Frontend is a pnpm + Vite + React 19 management console for the backend `/v0/management` API. The app is currently a single-page shell built around one large `src/App.tsx` component, a small typed API client, and shadcn/radix-nova UI primitives.

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
| Backend management client | `src/lib/management-api.ts` | wraps `/v0/management`, adds `X-Management-Key` |
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
pnpm lint
pnpm build
pnpm preview
```

## REPO-WIDE CONVENTIONS
- Use the `@/` alias for internal imports; it maps to `./src` in both Vite and TypeScript configs.
- `VITE_MANAGEMENT_API_BASE_URL` is the only frontend env var currently consumed by app code; the UI can still override the base URL interactively.
- Keep backend calls in `src/lib/management-api.ts` instead of sprinkling raw `fetch` calls through UI components.
- Treat `src/components/ui/` as generated-style primitives and keep app-specific composition in `src/components/` or `src/App.tsx`.
- Tailwind config is CSS-first in `src/index.css`; do not assume a `tailwind.config.*` file exists.
- `src/App.css` and `src/assets/` are leftover template artifacts, not the canonical styling or asset path for the current dashboard.

## NOTES
- Frontend CI currently runs install, lint, and build only; there is no checked-in frontend test suite yet.
- Docker builds accept `VITE_MANAGEMENT_API_BASE_URL`, `VITE_GIT_RUN_NUMBER`, and `VITE_GIT_REVISION`, then serve the built app from nginx.
