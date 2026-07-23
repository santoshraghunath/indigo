# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
# Dev servers
pnpm dev                          # apps/web on :5173
pnpm dev:portal                   # apps/portal (currently co-located in apps/web)

# Type checking (run before every commit)
pnpm type-check                   # all packages
pnpm --filter web type-check      # apps/web only

# Linting
pnpm lint                         # all packages (0 warnings allowed)

# Formatting
pnpm format                       # prettier across all TS/TSX/JSON/MD

# DB types (run after every migration)
pnpm --filter @indigo/db gen:types

# Tests (shared package only — no test framework, uses node --experimental-strip-types)
pnpm --filter @indigo/shared test
```

Netlify functions are **proxied locally by Vite** (see `apps/web/vite.config.ts`) — do not use `netlify dev`. The three proxied functions are `address-search`, `portal-invite`, and `employee-invite`.

---

## Architecture

### The most important constraint: shared Supabase database

Indigo and **BuildersBooks** (GGB's accounting platform) run on the **same Postgres database**. There are no sync jobs, no ETL. Both apps are React frontends querying the same tables. Every schema decision must account for BB's live production data.

### Critical naming — BB conventions must be matched exactly

| Use this | Never this |
|---|---|
| `tenant_id` / `tenants` | `organization_id` / `organizations` |
| `expenses` / `expense_items` | `bills` |
| `journal_lines` | `journal_entry_lines` |
| `job_change_orders` (BB table) | any other CO table name |

### BB tables Indigo uses directly — do not recreate

`tenants`, `accounts`, `customers`, `vendors`, `jobs`, `job_change_orders`, `invoices`, `invoice_items`, `payments`, `expenses`, `expense_items`, `journal_entries`, `journal_lines`, `subcontractors`, `subcontracts`, `subcontract_invoices`, `subcontract_change_orders`, `sequences`, `settings`

### Core entity pattern

```
tenants (BB)
  └── jobs (BB)                    ← financial source of truth
        └── projects (Indigo)      ← 1:1 extension via job_id FK
              ├── project_phases → milestones → draw_requests → invoices (BB)
              ├── estimates → estimate_line_items → accounts (BB)
              └── budgets → budget_line_items → accounts (BB)
```

When creating a project: create a `jobs` row first (or link existing), then a `projects` row with `job_id` FK.  
When creating a change order: create `job_change_orders` (BB — what financials read), then `change_order_line_items` (Indigo — FKs to the CO).

### Monorepo packages

| Package | Import alias | Purpose |
|---|---|---|
| `packages/db` | `@indigo/db` | Generated Supabase types only — regenerate after every migration |
| `packages/shared` | `@indigo/shared` | Typed service functions + money utils + shared types |
| `packages/ai` | `@indigo/ai` | Model router, provider adapters, versioned system prompts |
| `apps/web` | `@/*` → `src/*` | Main staff app |

All Supabase calls from components must go through `packages/shared` service functions — never query Supabase directly in components or hooks. This is the pattern for React Native portability.

### Auth — two completely separate flows

**Staff app** (`useAuth` / `useAuthStore`):
- Supabase email auth → loads `user_profiles` + `tenant_members` on session
- `FIELD_ROLES = ['field_associate', 'field_super', 'subcontractor']` — these roles bypass the dashboard and land at `/projects`
- `activeTenantId` from `useAuth()` is the source of truth for RLS scoping

**Client portal** (`usePortalAuth` / `usePortalAuthStore`):
- OTP magic link → `customers.portal_user_id = auth.uid()`
- On first login, auto-links by matching `auth.email` to `customers.email` (`linkCustomerByEmail`)
- Staff with `admin`/`owner` role can preview the portal (`isStaffPreview = true`)

Invite links are detected at app boot via `window.location.hash` — the JWT payload determines portal vs staff routing.

### RLS pattern

All RLS policies use these helper functions (defined in migration 002):

```sql
get_user_tenant_ids()              -- set of tenant_ids for current user
get_user_role(tenant_id uuid)      -- current user's role in a tenant
user_has_role(tenant_id, role)     -- role hierarchy check
is_client_on_job(job_id uuid)      -- true if current portal user owns this job
```

BB tables use `auth_tenant_id()` in their RLS. Indigo tables use `get_user_tenant_ids()`. Never use `service_role` key in frontend code.

### AI model router (`packages/ai`)

Use internal aliases — the provider files map these to actual API model IDs:

| Internal alias | Actual API name |
|---|---|
| `claude-sonnet-4-6` | `claude-sonnet-4-6` |
| `claude-haiku-4-5` | `claude-haiku-4-5-20251001` |

Task routing (from `TASK_ROUTING` constant):
- `co_draft`, `rfi_draft`, `estimate_draft`, `chat`, `general` → `claude-sonnet-4-6` (fallback: `gpt-4o`)
- `daily_log_summary` → `claude-haiku-4-5` (fallback: `deepseek-chat`)
- `document_extract` → `deepseek-reasoner` (fallback: `claude-sonnet-4-6`)

Entry point: `ask(req)` handles routing + streaming. System prompts live in `packages/ai/prompts/` as versioned TS constants.

### Netlify functions (`functions/`)

Server-side env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `TWILIO_*`.  
Client-side env (prefixed `VITE_`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`.

`SUPABASE_URL` is intentionally public (`SECRETS_SCAN_OMIT_KEYS` in `netlify.toml`).

### Money

All Indigo-owned tables store money as `bigint` cents. BB tables use `integer` cents (Postgres auto-promotes). Use `formatMoney(cents)` / `dollarsToCents` / `centsToDollars` from `@indigo/shared/utils`.

### Supabase queries

- Always explicit column lists — never `select('*')` in production code
- Supabase project ID: `fueksflgmkruauanhgzx`  
- Local dev port: `54332` (non-default — avoids conflict with BuildersBooks at `54322`)
- After any migration: `pnpm --filter @indigo/db gen:types`

### Design

Brand color: `brand.500 = #6366f1` (indigo). Custom Tailwind tokens: `surface.0`–`surface.3`, shadows `card`/`panel`/`modal`. No external component libraries — custom everything. All screens must be responsive; modals become bottom sheets on mobile; Gantt/tables get horizontal scroll with sticky first column. Minimum touch target 44×44px.

`@react-pdf/renderer` is excluded from Vite's `optimizeDeps` — this is intentional.
