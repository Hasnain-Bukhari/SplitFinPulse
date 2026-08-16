# Agent Operating Guide

## Start here

1. Read `README.md`.
2. Read the relevant sections of `docs/PROJECT.md` before architectural work.
3. Inspect the implementation, migrations, and tests related to the task.
4. Never assume that a capability is missing; search for it.
5. Search for existing patterns before creating a new pattern.

## Sources of truth

- Code is implementation truth.
- Prisma schema and migrations are persistence truth.
- Tests are the behavioral contract.
- Generated OpenAPI is the HTTP contract.
- `docs/PROJECT.md` is the sole product and architecture knowledge document.
- `README.md` is developer onboarding only.
- `AGENTS.md` is agent guidance only.

Do not duplicate the same facts across these files.

## Repository map

- `apps/api/src`: NestJS modular-monolith API.
- `apps/api/prisma`: Prisma schema and committed migrations.
- `apps/api/test`: PostgreSQL-backed API tests.
- `apps/web/src`: Vue application organized by product capability.
- `apps/web/src/lib/api`: client-side HTTP boundary and transport types.
- `apps/web/src/components/ui`: small, genuinely reused UI primitives.
- `.github/workflows/ci.yml`: required validation pipeline.

There are no shared packages yet. Create one only when at least two real consumers need a stable, framework-independent responsibility.

## Architecture rules

- Keep the backend a modular monolith. Do not create microservices.
- Align NestJS modules to business capabilities, not technical CRUD categories.
- Keep controllers thin; business rules belong in application/domain code.
- Domain logic must not depend on HTTP, Nest controllers, Prisma, Vue, or providers.
- Apply stronger domain separation to expenses, splits, ledger, and settlements.
- Keep simple modules simple. Do not create four layers mechanically.
- Prefer explicit domain names over generic helpers, managers, or common services.
- Use dependency inversion at external provider boundaries when it adds value.
- Do not import backend entities into the frontend.
- Keep all web HTTP access inside `apps/web/src/lib/api`.
- Use TanStack Query for server state and Pinia only for meaningful client state.
- Inspect existing patterns before adding dependencies or abstractions.

## Financial invariants

Financial correctness outranks convenience.

- Never use floating-point arithmetic for money.
- Represent money as integer minor units plus an ISO currency code.
- Enforce `sum(payers) == expense total`.
- Enforce `sum(splits) == expense total`.
- No rounding path may create or destroy money.
- Financial mutations must be transactional.
- Ledger generation must be deterministic and auditable.
- Never use a mutable current balance as the source of truth.
- Preserve financial edit/delete history; do not destroy explanations.
- Use idempotency for retryable financial writes.
- Use optimistic concurrency where financial edits can race.
- Enforce invariants in application code and database constraints where possible.
- Never bypass an invariant to ship a feature or make a test pass.

## API and persistence

- Product endpoints live below `/api/v1`; infrastructure endpoints are unversioned.
- Validate every DTO with the global validation policy.
- Return the established safe error shape and preserve request IDs.
- Enforce resource ownership, participation, membership, and roles server-side.
- Use pagination for unbounded data; prefer cursors for feeds and histories.
- Make financial writes idempotent where a retry could duplicate value.
- Use UUID or ULID identifiers and consistent `createdAt`/`updatedAt` timestamps.
- Add constraints and indexes for known invariants and query patterns.
- Do not soft-delete everything. Use history-preserving semantics where required.
- Never edit a committed migration that may have run outside the branch.

## Security and observability

- Treat all client input as untrusted.
- Never rely on hidden UI for authorization.
- Never expose or log passwords, tokens, OAuth credentials, secrets, or full sensitive financial payloads.
- Authentication credentials stay in HttpOnly cookies; never place them in JSON responses, URLs, Pinia, or browser storage.
- Protected product routes use the global guard and authenticated principal. Mark a route public only when anonymous access is intentional.
- Unsafe cookie-authenticated requests retain origin and CSRF validation; do not bypass it for convenience.
- Keep CORS, rate limiting, secure headers, input limits, and upload validation intact.
- Propagate the request ID through logs and errors.
- Log unexpected failures; do not silently swallow exceptions.
- Introduce storage, queues, caches, or monitoring vendors only for a concrete requirement.
- Never commit `.env` files or generated local credentials.

## Frontend and accessibility

- Use Vue 3 Composition API and `<script setup lang="ts">`.
- Organize by product feature as features arrive.
- Use semantic design tokens instead of random color or spacing values.
- Design mobile first and enhance for desktop.
- Preserve keyboard access, visible focus, screen-reader semantics, contrast, and reduced motion.
- Use tabular numerals for amounts.
- Never communicate a financial state by color alone.
- PWA caching must not cache API or financial responses by default.

## Change discipline

- Keep changes scoped to the requested task.
- Extend existing abstractions rather than duplicating them.
- Avoid unrelated refactoring and formatting churn.
- Do not silently change public APIs or database semantics.
- Do not add speculative infrastructure, packages, domain models, or placeholder abstractions.
- Avoid `any`, unchecked assertions, and TypeScript suppressions.
- Prefer cohesive source files under roughly 300 lines; do not fragment code arbitrarily.
- Do not weaken, delete, or skip tests merely to make validation pass.

## Required validation

Run the checks relevant to the change. Before completion, normally run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm test:e2e` for API, persistence, authorization, or critical-journey changes. PostgreSQL must be running. Add focused unit tests for financial calculations and integration tests for important persistence behavior.

Review the final diff and report the exact commands run plus anything not verified.

## Documentation policy

The only documentation files are:

- `README.md`
- `AGENTS.md`
- `docs/PROJECT.md`

Never create summary, context, status, progress, notes, architecture, decisions, TODO, or changelog documents. Update `docs/PROJECT.md` only when architecture, scope, domain rules, important decisions, roadmap, or meaningful implementation status changes. Do not record routine file-level work or daily progress.
