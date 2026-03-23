# src

Parent: `../AGENTS.md`

## OVERVIEW
Frontend source tree for the Cockpit management console. `App.tsx` is the canonical app shell: it owns the sidebar nav, connection and busy state, OAuth flow, model-catalog loading, auth-file dialogs, and the current Access / Runtime / API Keys / Codex Keys / Auth Files dashboard plus the standalone Model Catalog section.

## WHERE TO LOOK
- `App.tsx`: `NAV_ITEMS`, the Access / Runtime / API Keys / Codex Keys / Auth Files sections, the standalone Model Catalog section, `withBusy`, OAuth flow, and auth-file edit/models dialogs.
- `main.tsx`: React mount only; keep it thin.
- `lib/management-api.ts`: typed same-origin request helper, Bearer-token header wiring, and `ManagementRequestError`.
- `lib/management-access.ts`: shared disable rule for busy or missing-key management actions.
- `types/management.ts`: shared request and response contracts plus `MANAGEMENT_BASE_PATH`.
- `components/section-card.tsx`: standard wrapper for scroll-linked dashboard sections.
- `components/json-editor-card.tsx`: standard wrapper for JSON textarea sections with refresh/save actions.
- `components/ui/`: shadcn/radix-nova primitives reused by the app shell.
- `index.css`: Tailwind v4 theme tokens, dark-mode variables, and global font setup.

## LOCAL CONVENTIONS
- Add or reorder sidebar sections by extending `NAV_ITEMS` and rendering a `SectionCard` or `JsonEditorCard` in `App.tsx`.
- Keep management API paths centralized through `createManagementClient`; do not add parallel raw `fetch` wrappers.
- Keep management requests same-origin through `createManagementClient`; keep Bearer-token header logic there too, and do not reintroduce per-browser base-url storage or override helpers.
- Keep new shared contracts in `types/management.ts` before introducing local inline type copies.
- Use `@/` imports everywhere under `src/`.
- Keep app-specific composition in `components/`; treat `components/ui/` as reusable primitives.
- Prefer extending the existing feedback/busy-state patterns in `App.tsx` over inventing one-off async UI states.
- Treat `App.tsx` as a composition hotspot: extend the existing section pattern first, and split code only when a new subflow becomes reusable outside the app shell.

## ANTI-PATTERNS
- Do not introduce a second API base-path constant outside `types/management.ts`.
- Do not add a router, global store, or alternate entrypoint without updating this file and `frontend/AGENTS.md`.
- Do not treat `App.css` or `assets/` as canonical sources for current dashboard styling.

## CHECKS
```bash
pnpm test
pnpm lint
pnpm build
```
