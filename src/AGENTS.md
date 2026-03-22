# src

Parent: `../AGENTS.md`

## OVERVIEW
Frontend source tree for the Cockpit management console. `App.tsx` is the canonical app shell: it owns the section registry, local state, async actions, dialogs, and feedback flow.

## WHERE TO LOOK
- `App.tsx`: all management sections, `withBusy`, dashboard bootstrap, OAuth flow, auth-file actions, and API tool UI.
- `main.tsx`: React mount only; keep it thin.
- `lib/management-api.ts`: typed request helper and `ManagementRequestError`.
- `types/management.ts`: shared request and response contracts plus `MANAGEMENT_BASE_PATH`.
- `components/section-card.tsx`: standard wrapper for scroll-linked dashboard sections.
- `components/json-editor-card.tsx`: standard wrapper for JSON textarea sections with refresh/save actions.
- `components/ui/`: shadcn/radix-nova primitives reused by the app shell.
- `index.css`: Tailwind v4 theme tokens, dark-mode variables, and global font setup.

## LOCAL CONVENTIONS
- Add new dashboard sections by extending `NAV_ITEMS` and rendering a `SectionCard` or `JsonEditorCard` in `App.tsx`.
- Keep management API paths centralized through `createManagementClient`; do not add parallel raw `fetch` wrappers.
- Keep new shared contracts in `types/management.ts` before introducing local inline type copies.
- Use `@/` imports everywhere under `src/`.
- Keep app-specific composition in `components/`; treat `components/ui/` as reusable primitives.
- Prefer extending the existing feedback/busy-state patterns in `App.tsx` over inventing one-off async UI states.

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
