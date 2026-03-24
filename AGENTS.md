# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-25T00:00:00+02:00
**Commit:** 994e777
**Branch:** main

## OVERVIEW
Cockpit Frontend is a pnpm + Vite + React 19 management console for the backend management and provider surfaces. The UI still centers on one large `src/App.tsx` shell, but startup now flows through `src/main.tsx` and `src/bootstrap/backend-selector.ts` so the browser picks or restores a backend origin before `App` mounts, then reloads dashboard state against that selected backend when the user switches instances.

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
| Frontend source layout and app behavior | `src/AGENTS.md` | source-tree rules, app-shell composition, helpers, and source-level tests live there |
| Frontend bootstrap entry | `src/main.tsx`, `src/bootstrap/backend-selector.ts` | browser startup chooses or restores a backend origin before mounting `App` |
| Toolchain and local commands | `package.json` | Node 24+, pnpm scripts, and package-manager pin |
| Build and dev server config | `vite.config.ts`, `tsconfig*.json` | Vite proxy settings plus the `@/` alias into `src/` |
| UI registry and lint config | `components.json`, `eslint.config.js` | shadcn registry wiring and the `src/components/ui/` lint exception |
| Container packaging | `Dockerfile`, `nginx.conf` | image build, build args, and SPA serving |
| Frontend CI | `.github/workflows/ci.yml` | install, lint, and build only |
| Human quick start | `README.md` | local setup, preview, and deployment notes |

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
- Read `src/AGENTS.md` before editing frontend source files; this root file stays focused on setup, packaging, and high-level app shape.
- Use the `@/` alias for internal imports; it maps to `./src` in both Vite and TypeScript configs.
- Keep frontend-root changes focused on toolchain, build, CI, Docker, nginx, and bootstrap wiring rather than source-level UI behavior.
- Tailwind config is CSS-first in `src/index.css`; do not assume a `tailwind.config.*` file exists.

## NOTES
- Vite dev proxy still forwards same-origin `/api`, `/v1`, and `/api/provider` requests to `COCKPIT_LOCAL_BACKEND_URL`, while the browser bootstrap can restore a saved backend origin or let the user switch to another reachable backend before `App` renders.
- Frontend CI currently runs install, lint, and build only. `pnpm test` exists locally but is not part of `.github/workflows/ci.yml` yet.
- Docker builds accept `VITE_GIT_RUN_NUMBER` and `VITE_GIT_REVISION`, then serve the built app from nginx.
