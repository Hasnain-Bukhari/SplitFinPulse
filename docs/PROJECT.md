# Project

## Vision

SplitFinPulse helps people understand personal finances and shared obligations without losing the history behind a number. It begins as a responsive PWA and is designed to support native mobile clients later through the same client-agnostic API.

Financial correctness, explainability, security, accessibility, and maintainability are product requirements rather than later polish.

## Product Scope

Planned capabilities include authentication, profiles, accounts, income, personal and shared expenses, friends, groups, multiple payers, splits, balances, ledger entries, settlements, debt simplification, categories, budgets, recurring expenses, currencies, receipts, activity, comments, notifications, reminders, search, analytics, reports, administration, and carefully bounded AI assistance.

The application foundation, account lifecycle, friendships, private user
discovery, shareable friend invitations, permission-aware contact selection,
and groups with role-based membership are implemented. The financial core now
supports versioned friend and group expenses, deterministic split and ledger
calculations, ledger-derived balances, non-destructive debt-simplification
recommendations, and history-preserving manual settlements. Transactional
activity feeds, expense discussions, and a separate append-only security audit
trail provide product and operational traceability.

## Architecture

The backend is a modular monolith. Business capabilities own their behavior and persistence boundaries inside one deployable NestJS application and one PostgreSQL database. Strong boundaries allow later extraction only if demonstrated scale or organizational needs justify it; microservices are not a starting goal.

Complex financial capabilities will separate pure domain logic from application orchestration, Prisma persistence, and HTTP presentation. Small capabilities may use a simpler structure. Controllers validate transport input, invoke an application operation, and map the result; they do not contain business rules.

External systems such as exchange rates, storage, email, notifications, OCR, and payments use narrow provider boundaries. Receipt storage currently uses a private local-filesystem adapter, OCR uses its durable PostgreSQL-leased worker with local Tesseract image processing, and exchange rates use a replaceable Frankfurter v2 adapter with manual and explicitly unavailable fallbacks. A shared PostgreSQL-leased job runner now owns recurring expense materialization, reminders, budget evaluation, and remote notification delivery. Firebase Cloud Messaging and Resend sit behind replaceable push and email adapters. Redis, hosted object storage, hosted OCR, and general-purpose distributed caches remain absent.

## Repository Structure

```text
apps/api/  NestJS application, Prisma schema, and API tests
apps/web/  Vue PWA, UI system, and browser-side API client
docs/      This canonical project document only
```

Workspace packages are deferred until multiple real consumers justify shared code. Backend domain types never cross directly into frontend code.

## Core Domain Model

The domain centers on users, accounts, groups, expenses, payers, split allocations, ledger entries, and settlements. Friendships use one canonical participant pair with an authorized requester and preserved pending, accepted, declined, and removed states. Friend invitations are signed, expiring, single-use records whose raw tokens are never stored. Groups retain membership history, have one transferable owner, and use expiring, revocable, multi-use invitation links whose raw tokens are never stored. Expenses and settlements have stable identities and immutable revision snapshots; only their current active revisions contribute ledger rows to balances. Settlement entries offset obligations without rewriting the expenses that created them. Activity recipients are captured when an event occurs, comments retain deletion tombstones, and security audit events remain separate from the user-facing activity feed. Further financial schema is designed with its first product slice rather than committed speculatively.

Money is always an integer amount in currency minor units plus an ISO currency code. An expense describes an event; payer and split allocations explain funding and responsibility; immutable or history-preserving ledger records explain resulting obligations. Balances are projections over auditable records, never the primary mutable truth.

## Backend Modules

The bootstrap contains configuration, database, HTTP, jobs, and system-health infrastructure. Implemented product boundaries include auth, users, friends, groups, expenses, ledger, settlements, categories, budgets, currencies, recurring expenses, activities, comments, attachments, notifications, reminders, and analytics.

Modules are created only as capabilities are implemented. The Friends module owns friendship transitions, exact-email discovery, contact matching, and friend-invitation redemption. The Groups module owns group lifecycle, role permissions, membership history, ownership transfer, and group-invitation redemption. Expenses, settlements, splits, and ledger use stronger domain separation and extensive pure tests. Activities and comments provide authorized product history, while audit records use a separate restricted boundary.

## Frontend Architecture

The Vue application uses Composition API, Vue Router, TanStack Query for server state, and Pinia for meaningful application state. Product code will be grouped by feature. `src/lib/api` is the only HTTP boundary; components do not issue ad hoc requests.

The design system is mobile-first and token-driven, with light/dark/system themes. Semantic tokens cover standard UI states and owed-to-user, owed-by-user, settled, and pending finance states. Text and icons accompany color. Keyboard navigation, focus visibility, contrast, screen-reader semantics, reduced motion, and tabular financial numerals are baseline requirements.

The PWA caches only static application-shell assets. API and financial responses are network-only unless a later offline design explicitly defines freshness, encryption, conflict, and privacy behavior.

## Financial Invariants

- Money never uses binary floating-point arithmetic.
- Payer allocations sum exactly to the expense total.
- Split allocations sum exactly to the expense total.
- Rounding cannot create or destroy minor units.
- Financial mutations are transactional.
- Ledger output is deterministic and auditable.
- Edits and deletion preserve historical explanation.
- Retryable financial writes use idempotency protection.
- Concurrent financial edits use versioning where races are possible.
- Application validation and database constraints enforce invariants together.

Multi-currency records retain their original amount and currency as ledger truth. Every new expense and settlement revision records an immutable valuation set, including an explicit unavailable state. Exact rational rates are converted per ledger contribution and rounded once to the reporting currency's minor unit with half-even rounding; converted summaries remain separate, labeled projections and report missing-rate incompleteness.

## Authentication & Authorization

Google OIDC uses a backend Authorization Code + PKCE flow with state and nonce
validation. Google tokens are discarded after identity validation. The web PWA
uses short-lived access JWT and rotating refresh JWT credentials in host-only,
HttpOnly cookies, backed by revocable PostgreSQL session records. Refresh-token
hashes, session versioning, origin validation, and double-submit CSRF protection
provide rotation, replay detection, and immediate local revocation.

Users can inspect/revoke sessions, update profile and formatting defaults,
download the currently held account data, deactivate/reactivate, or irreversibly
anonymize their account. Deleted users retain a tombstone UUID so later shared
financial history cannot be corrupted. Custom avatar storage, alternate identity
providers, MFA, notification delivery, and native token transport remain deferred.

Authorization is always server-side. Every operation must validate ownership, group membership, roles, and expense participation as appropriate. Hiding a frontend control is never authorization.

## API Conventions

Product REST resources are versioned below `/api/v1`. `/health`, `/ready`, `/api/docs`, and `/api/docs-json` are unversioned infrastructure endpoints. OpenAPI is generated from the running API.

Input uses validated DTOs. Errors include `statusCode`, stable `code`, safe `message`, `path`, `requestId`, and `timestamp`. Unbounded collections are paginated; activity/history feeds prefer cursor pagination. Financial create operations use idempotency keys where retries can duplicate value.

Every request accepts or receives an `X-Request-Id`. The API logs structured request completion events without sensitive financial bodies.

## Database Conventions

PostgreSQL is accessed through Prisma. Prisma schema and committed migrations are persistence truth. The bootstrap intentionally has no placeholder models; the first domain model introduces the first migration.

Use UUID/ULID identifiers, `createdAt`, `updatedAt`, explicit foreign keys, and constraints reflecting business invariants. Add indexes for known query patterns, not mechanically. Financial history must not be physically deleted. Soft deletion is used only when its semantics are deliberate.

## Background Jobs

No job system exists. BullMQ and Redis may be introduced for demonstrated asynchronous work such as recurring-expense materialization or notification delivery. Jobs must be idempotent, observable, retry-bounded, and expose terminal failures.

## Security

All client input is untrusted. The API uses an explicit CORS allowlist, secure headers, global DTO validation, request limits, throttling, normalized errors, and server-side authorization boundaries. Secrets come from validated environment variables and are never committed or logged. Future uploads require type, size, content, ownership, and malware controls before object storage is introduced.

## Testing Strategy

Vitest is the workspace test runner. Pure unit tests cover domain calculations and infrastructure behavior. PostgreSQL-backed integration tests cover constraints, transactions, authorization, and persistence. End-to-end tests cover critical user journeys once they exist.

Financial tests must cover equal, exact, percentage, and share splits; multiple payers; rounding; ledger generation; settlements; debt simplification; and currency conversion. Property-based testing is preferred where it can prove conservation invariants across broad inputs.

## Observability

The API emits structured JSON logs and a request ID for correlation. `/health` reports process liveness without dependencies. `/ready` verifies PostgreSQL. Unexpected errors are logged with safe context and never silently swallowed. A hosted error-monitoring provider will be selected with deployment rather than embedded speculatively.

## Deployment

Local development runs Node applications on the host and PostgreSQL 17 through Docker Compose. Multi-stage Dockerfiles produce non-root API and web runtime images; the web image provides SPA fallback and immutable caching for fingerprinted assets.

GitHub Actions installs from the frozen pnpm lockfile, applies migrations to PostgreSQL, checks formatting and linting, typechecks, runs unit and API integration tests, and builds both applications. A production hosting provider and release pipeline are not yet selected.

## Mobile Strategy

The Vue application is an installable responsive PWA. Capacitor can wrap the web client later, while native clients consume the same REST/OpenAPI contract. The backend never depends on a browser-specific session, navigation, storage, or rendering assumption without an equivalent mobile strategy.

## Current Implementation

- pnpm workspace with strict TypeScript, ESLint, Prettier, local Git hooks, and CI
- NestJS API with validated configuration, Prisma/PostgreSQL, structured logging, request IDs, security defaults, OpenAPI, liveness, readiness, and normalized errors
- Vue PWA with responsive navigation, accessible empty dashboard shell, design tokens, themes, Pinia, TanStack Query, and a typed API client boundary
- PostgreSQL Compose service and production-oriented API/web Dockerfiles
- Unit, PostgreSQL-backed API integration, frontend component, and local browser test foundations
- Google authentication, internal users/identities, rotating cookie sessions, profile/preferences, session controls, export, deactivation/reactivation, and deletion anonymization
- Authorized friendship requests and lifecycle, exact-email/contact discovery,
  responsive friends UI, and signed single-use shareable invitation links
- Group creation, settings, archiving, safe deletion, one-owner role management,
  history-preserving membership, and signed multi-use invitation links
- Friend and group expenses with multiple payers, equal/exact/percentage/share
  splits, immutable revisions, idempotent creation, optimistic concurrency,
  reversible deletion, and auditable ledger entries
- Overall, per-friend, and per-group multi-currency balance projections with
  expense drill-down and deterministic, non-destructive debt simplification
- Full and partial manual settlements with idempotent creation, participant-only
  recording, capped outstanding amounts, immutable reversal/replacement history,
  and settlement-aware balance explanations
- Cursor-paginated personal and group activity feeds, author-owned expense
  comments with tombstones, and append-only personal security history
- System and owner-managed categories with archived historical snapshots,
  authorized expense/group/person search, composable URL-backed expense filters,
  and deterministic allocation-derived open/partial/settled explanations
- Private local receipt attachments with one-use upload intents, magic-byte and
  size validation, authenticated viewing, deletion tombstones, and a durable
  PostgreSQL-leased Tesseract image OCR suggestion workflow
- Canonical currency metadata, immutable live/manual/unavailable exchange-rate
  snapshots, exact rational conversion, and labeled optional reporting-currency
  balance summaries that preserve native totals
- Versioned recurring expense templates with backend-only calendar previews,
  PostgreSQL job dispatch/materialization, pause/resume/edit history, and
  idempotent generated expenses
- Transactional in-app notifications, per-channel preferences, encrypted FCM
  web-push registrations, Resend email delivery, and creditor-only immediate or
  scheduled payment reminders
- Native-currency spending analytics and personal, category, and group monthly
  budgets with exact current-expense progress and deduplicated 80/100 percent
  threshold alerts

Personal financial accounts and general report exports do not exist yet.
External payment initiation and reconciliation, hosted storage/OCR, native push,
and cloud infrastructure remain deferred.

## Roadmap

This is an implementation sequence, not the Epic numbering used by the master
product plan.

1. Framework-independent money value objects and conservation tests.
2. Accounts, friends, and groups with authorization boundaries.
3. Expenses with multiple payers, split strategies, audit history, and deterministic ledger generation.
4. Balances, partial/full settlements, debt simplification, activity, comments, and security audit.
5. Budgets, recurring expenses, notifications, reminders, and analytics.
6. Reports, administration, native packaging, and evidence-driven AI assistance.

## Important Decisions

- Start as a modular monolith; extraction requires evidence.
- Preserve financial events and derive balances from auditable records.
- Use integer minor units with explicit currencies.
- Derive expense settlement state from immutable allocation paths; never store a mutable settled flag.
- Keep receipt files private behind storage/OCR interfaces and authenticated short-lived intents.
- Preserve native currency obligations and treat converted summaries as explicit write-time-snapshot valuations.
- Use PostgreSQL leasing and durable dedupe keys for background jobs; provider calls never run inside request transactions.
- Treat recurring schedules as immutable revisions and generated occurrences as ordinary idempotent expenses.
- Define spending as current expense responsibility in one native currency; settlements never alter spending analytics.
- Keep the API client-agnostic and REST/OpenAPI based.
- Keep shared workspace packages, Redis, queues, object storage, and provider integrations deferred until they solve a real need.
- Maintain exactly this project knowledge document rather than parallel summaries or diaries.
