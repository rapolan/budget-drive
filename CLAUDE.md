# Budget Drive Protocol (BDP) — CLAUDE.md

Multi-tenant driving school management platform. React + Express + PostgreSQL.
BSV blockchain integration exists but is **currently disabled** behind a feature flag.

## Architecture

- Monorepo layout: `/backend` (Express + TypeScript + pg), `/frontend` (React 18 + Vite + Tailwind), `/docs`
- Layering: routes → controllers → services. **Services own all DB access.** Never write SQL in a controller or route.
- Multi-tenant: **EVERY query that touches tenant data MUST filter by `tenant_id`**, obtained via `getTenantId(req)` from `backend/src/middleware/tenantContext.ts`. A query without a tenant filter is a security bug, not a style issue. Flag it immediately if you see one.
- Naming: `snake_case` in the database, `camelCase` in TypeScript. Conversion helpers live in `backend/src/utils/caseConversion.ts` — use them, don't hand-roll mapping.
- Logging: use `logger` from `backend/src/utils/logger.ts` (Winston). No bare `console.log` in services or controllers.

## BSV / Ledger rules (IMPORTANT)

- All blockchain writes go through the `LedgerService` interface in `backend/src/services/ledger/`. Business logic must NEVER import `walletService` or `treasuryService` directly.
- The active implementation is chosen at startup from `BSV_ENABLED` (see `ledger/index.ts`). It is currently `false` → `NoopLedgerService` runs (logs the action, returns `txid: null`).
- `bsv_transaction_id` columns are nullable by design. Code must tolerate `null` txids everywhere.
- Do not delete or rewrite `walletService.ts` / `treasuryService.ts` — they are the future real implementation. Wrap, don't remove.
- Treasury routes return `501 Not Implemented` while the flag is off. Do not remove them.

## Commands

- Backend dev: `cd backend && npm run dev`
- Frontend dev: `cd frontend && npm run dev`
- Typecheck backend: `cd backend && npx tsc --noEmit` — **run after every change set**
- Typecheck frontend: `cd frontend && npx tsc --noEmit`
- Tests: `cd backend && npm test` (Vitest). Tenant-isolation tests must always pass.
- Lint: `npm run lint` in the relevant package
- Migrations: `cd backend && npm run migrate` (numbered SQL files in `backend/database/migrations`)

## Conventions

- New migrations are **append-only**: add a new numbered `.sql` file; never edit an existing migration.
- API responses follow the existing `{ success, data, message }` envelope — match it.
- Validation with `express-validator` at the route layer, mirroring existing routes.
- No new dependencies without asking first. The dependency list was recently pruned — keep it lean.
- Frontend data fetching goes through `frontend/src/api/*` modules and TanStack Query. No fetch/axios calls inside components.

## Do not touch

- `backend/database/migrations/*` (append-only, see above)
- `docs/archived_*` (historical record)
- `deployment-info.json` (LARS/CARS deployment schema)

## Definition of done for any task

1. `npx tsc --noEmit` clean in every package you touched
2. `npm run lint` clean
3. Tests pass (and new logic has tests if it's auth, tenant scoping, scheduling conflicts, or payments)
4. No secrets, keys, or WIFs in code or committed config
