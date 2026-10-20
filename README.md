# Community Equipment Hire

A configurable equipment-hire platform for community organisations: an API, a
public customer site and a staff admin panel.
One deployment runs one organisation, but nothing is hard-coded to a single
one: branding, copy, pricing, policies and email wording are all data, editable
by a non-technical administrator.

- **Runtime** Node.js 24, ESM JavaScript with JSDoc types
- **HTTP** Express 5
- **Database** PostgreSQL 17 via Drizzle ORM
- **Validation** Zod (requests *and* environment)
- **Auth** argon2id passwords, short-lived JWT access tokens, rotating refresh cookies
- **Payments** Stripe Checkout + webhooks
- **Email** transactional outbox → Resend (production) or Mailpit (local)
- **Frontends** React 19 + Vite, React Router, TanStack Query — no CSS framework;
  shared tokens in `packages/client` and branding colours applied from settings

---

## Getting started

Requires Node 24 (`nvm use`), pnpm 10, and Docker for the local database.

```bash
pnpm install                 # from the repo root
pnpm db:up                   # Postgres 17 + Mailpit in Docker

cd apps/api
cp .env.example .env         # the defaults work for local development
pnpm db:migrate              # apply migrations
pnpm db:seed                 # demo organisation, equipment and accounts

cd ../..
pnpm dev                     # API, customer site and admin panel together
```

| App | URL |
|---|---|
| API | http://localhost:4000 |
| Customer site | http://localhost:5173 |
| Admin panel | http://localhost:5174 |

Each also runs on its own: `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:admin`.
The frontends' dev servers proxy `/api` to the API, so the refresh cookies are
first-party locally and no CORS setup is needed.

Check it is alive:

```bash
curl http://localhost:4000/health   # process up, no database involved
curl http://localhost:4000/ready    # database reachable too
```

The seed creates two sign-ins:

| Role | Email | Password |
|---|---|---|
| Owner (admin panel) | `owner@example.org` | `ChangeMe123!` |
| Customer (public site) | `customer@example.org` | `CustomerPass123!` |

Sent email is caught by Mailpit at **http://localhost:8025** — nothing leaves
your machine.

### Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run with file watching |
| `pnpm test` | Full suite (unit + integration) |
| `pnpm test:unit` | Pure-logic tests only — no database needed |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm db:generate` | Generate a migration after editing the schema |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:studio` | Browse the database in a GUI |
| `pnpm db:reset` *(root)* | Destroy the volume and start clean |

---

## Layout

```
apps/web/                        Customer site: catalogue, availability, basket,
                                 checkout, payment hand-off, account, CMS pages
apps/admin/                      Staff panel: dashboard, bookings and the whole
                                 lifecycle, calendar, equipment, customers,
                                 enquiries, bonds, settings
packages/client/                 Shared by both: API client (in-memory token,
                                 single-flight refresh), formatting, booking
                                 status vocabulary, base CSS, UI primitives
```

```
apps/api/
├── drizzle/                     SQL migrations (generated + hand-written)
│   ├── 0000_extensions.sql      citext, btree_gist, uuid_generate_v7()
│   ├── 0001_initial_schema.sql  generated from src/db/schema
│   └── 0002_integrity.sql       constraints Drizzle cannot express
└── src/
    ├── app.js                   Express assembly — middleware order matters
    ├── server.js                bootstrap, graceful shutdown
    ├── config/                  env validation, logger
    ├── db/
    │   ├── client.js            pool, advisory locks
    │   ├── migrate.js           advisory-locked migration runner
    │   ├── seed.js              idempotent demo data
    │   └── schema/              52 tables, grouped by domain
    ├── lib/                     errors, jwt, password, time, money, pagination
    ├── middleware/              tenant, auth, validation, errors, rate limits
    └── modules/                 one folder per domain
        ├── auth/                registration, sign-in, token rotation
        ├── site/                public content, pages, navigation
        ├── equipment/           catalogue, inventory, availability calendar
        ├── availability/        the stock-reservation engine
        ├── pricing/             pure pricing functions
        ├── bookings/            lifecycle, rules, auto-approval, cancellation
        ├── payments/            Stripe Checkout, webhooks, refunds
        ├── notifications/       templates, outbox, recipients
        ├── settings/            per-organisation configuration
        ├── storage/             presigned uploads
        ├── cron/                the scheduled tick
        ├── admin/               dashboard, calendar, customers, enquiries, categories
        └── health/              liveness and readiness
```

Each module holds `*.schemas.js` (Zod), `*.service.js` (logic), and
`*.routes.js` / `*.admin.routes.js` (HTTP). Routes validate and delegate;
services never touch `req` or `res`.

---

## How it works

### Tenancy

Every tenant-owned table carries `organisation_id`, and the organisation is
resolved from the request's `Host` header through `organisation_domains`
(cached 60 seconds). The platform runs one organisation today, but the schema
is ready for more — which is what lets us host two differently branded demo
sites on one free deployment, and avoids a rewrite if the client wants genuine
multi-tenancy later.

### Double-booking is prevented by the database, not by code

`availability_blocks` records every period in which stock is unavailable —
bookings, maintenance, closures — as a `tstzrange`. For individually tracked
units a GiST exclusion constraint makes two overlapping active blocks for the
same unit **impossible to insert**:

```sql
EXCLUDE USING gist (unit_id WITH =, period WITH &&)
  WHERE (is_active AND unit_id IS NOT NULL)
```

An availability check in application code cannot give this guarantee: between
"is it free?" and "book it", another request can win. The check exists to
produce a friendly message; the constraint is what makes the system correct.
`test/integration/double-booking.test.js` fires ten simultaneous requests at
one unit and asserts that exactly one succeeds.

Bulk stock (a pool of 120 chairs) has nothing to exclude, so it is serialised
with `SELECT … FOR UPDATE` on the equipment row before quantities are summed.

Ranges are **half-open** — `[start, end)` — so a hire ending at 17:00 and the
next beginning at 17:00 do not collide, and same-day turnarounds work.

### Booking lifecycle

```
PENDING_REVIEW ──approve──► APPROVED ──pay──► CONFIRMED ──collect──► PICKED_UP
      │                        │                  │                      │
      ├─► REJECTED             ├─► EXPIRED        └─► CANCELLED      RETURNED
      └─► CANCELLED            └─► CANCELLED                              │
                                                                     COMPLETED
```

Every change goes through `transition()`, which checks the move is legal,
appends to `booking_status_history`, and releases stock when the booking stops
reserving it — in one transaction. It also uses optimistic concurrency (`status`
+ `version` in the `WHERE`), so two staff approving at once cannot both win.

"Overdue" is deliberately **not** a status: it is a late `PICKED_UP` booking.
Making it a status would lose the fact that the equipment is out. It is derived
at read time by `effectiveStatus()`, along with approvals past their payment
deadline.

### Money

Integer cents everywhere, GST-inclusive, as Australian consumer prices are
advertised. GST is therefore *extracted* (`total ÷ 11` at 10%), not added —
the common mistake of `total × 0.1` overstates it on every tax invoice.

Prices are **copied onto the booking** at submission. Resolving them live would
mean an existing invoice silently changed when staff edited the price list.

Bonds are charged with the hire fee, once, after approval. The textbook
alternative — authorise the bond, capture on damage — does not survive contact
with reality: card authorisations expire in about seven days, and community
bookings are made months ahead. So the bond is a real payment, refunded after
the return inspection.

### No queue, no worker, no Redis

A worker polling a queue would keep a serverless database awake permanently and
exhaust its monthly compute allowance. Instead:

- emails are written to an **outbox table inside the same transaction** as the
  change they describe, so a rolled-back booking can never send a confirmation,
  and an SMTP outage delays mail instead of failing bookings;
- GitHub Actions calls one signed endpoint **hourly** to expire unpaid
  approvals, flag overdue returns, process refunds and flush the outbox;
- every one of those jobs is idempotent, so a missed, repeated or overlapping
  tick is harmless — an advisory lock makes an overlapping call return
  immediately;
- `dispatchOutboxSoon()` nudges delivery after a request commits, so the common
  case still feels instant.

`/health` deliberately touches nothing: the platform's health check runs every
30 seconds forever, and if it hit the database it would keep it awake around
the clock. `/ready` is the one that checks.

### Auth

- argon2id at OWASP parameters; `verifyPassword` burns equal time for an
  unknown email, so response timing cannot be used to enumerate accounts.
- Access tokens live 15 minutes and carry the user's permissions, so authorising
  a request costs no query. Keep them in memory, never `localStorage`.
- Refresh tokens are opaque, stored only as a SHA-256 hash, rotated on every
  use. Presenting an already-rotated token means it was captured, so the
  **whole session family is revoked** — the attacker and the legitimate client
  are both signed out, which is the safe outcome.
- The customer site and admin panel have separate cookies, separate paths and
  separate token audiences. A customer-site token is rejected by admin routes
  even when its owner is staff, so an XSS bug on the public site cannot reach
  the back office.
- Permissions are data (`modules/auth/permissions.js`), never
  `if (role === 'manager')`.

### Configuration

Nothing user-facing is a constant. Branding, booking policy, cancellation
schedule, auto-approval rules, customer types and price tiers, email templates,
pages, navigation and checkout questions all live in tables and are editable in
the admin panel. `settings.schemas.js` declares each key with its type and
default, so an unknown key is rejected and a bad value cannot be saved.

Auto-approval conditions are a **closed vocabulary**, not a rule language — a
volunteer administrator cannot write a rule that breaks checkout.

---

## Testing

The Equipment Hire platform includes automated unit and integration tests for both backend and frontend applications.

Testing is performed using **Vitest**, with React Testing Library and jsdom used for frontend integration testing.

### Test Summary

| Application | Test Type | Test Files | Tests | Result |
|---|---|---:|---:|---|
| Backend API | Unit | 6 | 86 | Passed |
| Backend API | Integration | 3 | 37 | Passed |
| Customer Web | Unit | 4 | 23 | Passed |
| Admin Dashboard | Unit | 4 | 20 | Passed |
| Customer Web | Integration | 2 | 4 | Passed |
| Admin Dashboard | Integration | 2 | 5 | Passed |
| **Total** | | **21** | **175** | **All passed** |

These results were verified on 21 October 2026. Code coverage percentages have not been measured.

### Backend Testing

The backend contains **123 automated tests**, covering business logic, authentication, API endpoints and database interactions.

Run the complete backend test suite from the repository root:

```bash
pnpm --filter @equipment-hire/api test
```

Run backend unit tests only:

```bash
pnpm --filter @equipment-hire/api test:unit
```

Backend integration tests use a separate `eqhire_test` database and `TRUNCATE` between tests. The `test/global-setup.js` guard refuses to run unless the database name contains `test`.

The backend tests worth reading first:

| File | What it proves |
|---|---|
| `integration/double-booking.test.js` | Ten concurrent requests, one unit, one winner |
| `integration/auth.test.js` | Cookie flags, token rotation, reuse detection, audience separation |
| `unit/pricing.test.js` | Tiered rates, caps, inclusive-GST extraction |
| `unit/time.test.js` | Day counting across both Adelaide daylight-saving changes |
| `unit/auto-approval.test.js` | Rule precedence and the mandatory-review override |
| `unit/cancellation.test.js` | Refund schedule; the bond always returns in full |
| `integration/admin.test.js` | Admin endpoints; no password hash ever leaves the server |

### Frontend Unit Testing

Frontend unit tests were added to verify individual React components and JavaScript functions without requiring a running backend or database.

The tests follow the **Arrange–Act–Assert (AAA)** pattern and use mock data to verify expected behaviour.

**Customer Web — 23 tests**

Located in `apps/web/test/unit/`.

| Test File | Functionality Tested |
|---|---|
| `slots.test.js` | Equipment pickup and return time windows |
| `EquipmentVisual.test.js` | Equipment images and placeholders |
| `EquipmentCard.test.js` | Equipment name, category, price and displayed information |
| `BookingStatus.test.js` | Booking status labels and visual indicators |

**Admin Dashboard — 20 tests**

Located in `apps/admin/test/unit/`.

| Test File | Functionality Tested |
|---|---|
| `PageHeader.test.js` | Page titles, subtitles and actions |
| `MoneyInput.test.js` | Monetary values displayed in input fields |
| `StatusBadge.test.js` | Booking status badges |
| `moneyHelpers.test.js` | Dollar-to-cent conversion and currency formatting |

These tests use Vitest and React's `renderToStaticMarkup()` to verify rendered HTML and JavaScript function outputs.

Run Customer Web unit tests from the repository root:

```bash
apps/api/node_modules/.bin/vitest run --config apps/web/test/vitest.config.js
```

Run Admin Dashboard unit tests:

```bash
apps/api/node_modules/.bin/vitest run --config apps/admin/test/vitest.config.js
```

### Frontend Integration Testing

Frontend integration tests verify how multiple React components, state management, routing and mocked API responses work together during user interactions.

The tests use:

- **Vitest** — test execution and assertions
- **React Testing Library** — rendering and querying components
- **jsdom** — simulated browser environment
- **user-event** — simulated clicking, typing and other user actions
- **Mock API responses** — predictable test data without real network requests

**Customer Web — 4 tests**

Located in `apps/web/test/integration/`.

| Test Scenario | Expected Behaviour |
|---|---|
| Add equipment to basket | Selected quantity is added and a confirmation is displayed |
| Navigate to basket | Basket page displays the selected equipment |
| Update basket quantity | Quantity and stored basket data update correctly |
| Remove equipment | Equipment is removed and the empty-basket message appears |

**Admin Dashboard — 5 tests**

Located in `apps/admin/test/integration/`.

| Test Scenario | Expected Behaviour |
|---|---|
| Equipment status filtering | API query and displayed equipment match the selected status |
| Equipment searching | Search query is sent and results update |
| Approve booking | Correct discount is submitted and confirmation is shown |
| Booking approval error | Error message is displayed and the dialog remains open |
| Decline booking | A reason is required before submission |

Run Customer Web integration tests:

```bash
pnpm --filter @equipment-hire/web exec vitest run --config test/vitest.integration.config.js
```

Run Admin Dashboard integration tests:

```bash
pnpm --filter @equipment-hire/admin exec vitest run --config test/vitest.integration.config.js
```

These frontend integration tests use mocked API responses and do not require Docker, PostgreSQL or a running backend server.

### Test Directory Structure

```text
apps/
├── api/
│   └── test/
│       ├── unit/
│       └── integration/
├── web/
│   └── test/
│       ├── unit/
│       └── integration/
└── admin/
    └── test/
        ├── unit/
        └── integration/
```

### Testing Limitations

The frontend unit tests focus on individual component rendering and JavaScript logic.

The frontend integration tests simulate user interactions and mocked API responses. They do not verify actual HTTP communication with the backend or database.

Full end-to-end browser testing, complete payment flows, cross-browser compatibility and code coverage measurement are outside the scope of the current automated frontend tests.

The frontend test suites are not currently included in the root `pnpm test` command or GitHub CI workflow and must be run using the separate commands above.


---


## Frontends

Both are static builds (`pnpm build` → `apps/*/dist`) and need no server.

- **The access token is held in memory only.** A reload restores the session
  by trading the httpOnly refresh cookie at `/auth/refresh`. Concurrent 401s
  share one refresh call; two parallel refreshes would present a rotated token
  and trip the server's reuse detection, signing the user out.
- **Prices are never computed in the browser.** The basket asks
  `POST /bookings/quote` and shows exactly what the server returns; the server
  re-prices again on submission.
- **The basket only offers valid handover times.** Collection and return
  windows come from `/site/locations/:id/slots`, and the API rejects bookings
  outside them, so the time pickers are filtered to match.
- **Everything branded comes from `GET /site`.** Colours, names, navigation,
  hero copy, footer and contact details are settings, not code.
- **CMS pages resolve at the root** (`/about`), so staff can link pages without
  a `/pages/` prefix. Unknown paths fall through to "not found".
- **Staff markdown is sanitised** (DOMPurify) before rendering.

Set `VITE_API_URL` to the API's origin in production. Equipment images are
stored as object keys; set `VITE_MEDIA_URL` to the bucket's public URL
(`S3_PUBLIC_BASE_URL`), otherwise a branded placeholder is shown.

---

## Deployment (free tier)

| Piece | Service | Note |
|---|---|---|
| API | Render free web service | Sleeps after 15 min idle; cold start is slow, not broken |
| Database | Neon free Postgres | Scales to zero after 5 min; use the **non-pooled** URL for migrations |
| Frontends | Cloudflare Pages | Customer site and admin panel |
| Email | Resend | 100/day on the free plan |
| Files | Cloudflare R2 | Browser uploads directly via presigned PUT |
| Scheduler | GitHub Actions | Hourly tick |

`render.yaml` is a blueprint; secrets are set in the dashboard, never in git.
The start command runs migrations before serving, under an advisory lock, so two
instances starting together cannot migrate concurrently.

Required GitHub secrets for the tick: `API_BASE_URL`, `CRON_SECRET`.

### Environment

`src/config/env.js` validates every variable at boot and **exits with a
readable list** if anything is wrong, rather than failing mysteriously later. In
production it additionally refuses to start on a placeholder `JWT_SECRET`, a
Stripe test key, or `EMAIL_PROVIDER=log` (which would silently drop every
email). See `.env.example` for the full list.

---

## Conventions

- **Never read `process.env` outside `config/env.js`.** A typo becomes
  `undefined` and surfaces days later.
- **Validated input lands on `req.valid`, not `req.body`.** Reaching for
  `req.body` after validation means using unvalidated data.
- **Scope every tenant query** through `lib/scoped.js`. A missing
  `organisation_id` filter is the one bug that leaks another organisation's data.
- **Pass the transaction.** A helper that queries the global pool from inside a
  transaction takes a second connection while holding the first; under
  concurrent load that exhausts the pool and deadlocks. `getAppUrl`,
  `getSettings` and `staffRecipients` all accept an executor — pass `tx`.
- **Queue emails with `enqueueEmail(tx, …)`**, inside the transaction.
- **Never call Stripe inside a transaction.** Queue a row; the tick sends it.
- **Money is integer cents.** Never a float.
- **Throw `AppError`** for anything the user should see. Anything else becomes a
  generic 500, by design.
- Express 5 forwards async errors automatically — no `try/catch` in routes.

### Adding a field

1. Edit the table in `src/db/schema/`
2. `pnpm db:generate` — review the SQL it produces
3. `pnpm db:migrate`
4. Update the module's Zod schema and service
5. `pnpm test`

CI fails if the schema and migrations drift apart.

---

## API shape

Base path `/api/v1`. Success is `{ "data": … }`; a paginated list adds `meta`.
Errors are:

```json
{ "error": { "code": "ALREADY_BOOKED", "message": "…", "requestId": "…" } }
```

`requestId` appears in both the response and the logs — ask a user for it and
the exact request is findable.

| Area | Path |
|---|---|
| Public content | `GET /site`, `/site/pages/:slug`, `/site/terms` |
| Catalogue | `GET /equipment`, `/equipment/:slug`, `/equipment/:slug/availability` |
| Customer auth | `POST /auth/register`, `/auth/login`, `/auth/refresh` |
| Bookings | `POST /bookings/quote`, `POST /bookings`, `POST /bookings/:ref/checkout` |
| Account | `GET /me`, `GET /bookings` |
| Admin | `/admin/auth/*`, `/admin/bookings/*`, `/admin/equipment/*`, `/admin/settings/*`, `/admin/payments/*` |
| Admin overview | `GET /admin/dashboard`, `GET /admin/calendar?from&to` |
| Admin directory | `/admin/customers`, `/admin/enquiries`, `/admin/categories` |
| Stripe | `POST /webhooks/stripe` *(raw body, mounted before the JSON parser)* |
| Scheduler | `POST /internal/cron/tick` *(`X-Cron-Secret`)* |
