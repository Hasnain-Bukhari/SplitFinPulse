# SplitFinPulse

SplitFinPulse is a modern personal-finance and shared-expense platform. It begins as a responsive web application and installable PWA, backed by a client-agnostic API that can later support native iOS and Android clients.

## Technology

- NestJS, TypeScript, REST, OpenAPI, Prisma, and PostgreSQL
- Vue 3, Vite, Vue Router, Pinia, and TanStack Query
- Tailwind CSS, shadcn-vue foundations, Reka UI, and Lucide icons
- pnpm workspaces, Docker Compose, Vitest, ESLint, Prettier, and GitHub Actions

## Repository structure

```text
apps/api/       NestJS API and Prisma schema
apps/web/       Vue PWA and design system
docs/PROJECT.md Canonical product and architecture knowledge
AGENTS.md       Operating rules for coding agents
```

## Prerequisites

- Node.js 22.12 or newer in the Node 22 line (`.nvmrc` pins 22.16.0)
- Corepack with pnpm 11.17
- Docker Desktop or another Docker Compose-compatible runtime
- A Google OAuth web client for interactive sign-in testing

## Installation

```bash
corepack enable
pnpm install
cp .env.example .env
```

The committed example contains local-only credentials. Never commit real secrets.

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from a Google OAuth web
client. Register `http://localhost:3000/api/v1/auth/google/callback` as an
authorized redirect URI. Replace all authentication and invitation secrets with
different random values of at least 32 characters.

Receipt files use the private local directory configured by
`ATTACHMENT_STORAGE_ROOT`; it must remain outside the web application's public
files. `ATTACHMENT_UPLOAD_SECRET` signs short-lived local upload/view intents.
Image OCR runs locally with the packaged English Tesseract data. PDF receipts
can be attached and viewed but are not OCR-processed.

## Local development

Start PostgreSQL, apply migrations, and launch the API, web application, and
PostgreSQL job worker:

```bash
pnpm docker:db:up
pnpm db:migrate:deploy
pnpm dev
pnpm dev:worker
```

- Web: <http://localhost:5173>
- API: <http://localhost:3000>
- PostgreSQL: `localhost:5433` (container port 5432)
- OpenAPI UI: <http://localhost:3000/api/docs>
- Liveness: <http://localhost:3000/health>
- Readiness: <http://localhost:3000/ready>

Run one application with `pnpm dev:api` or `pnpm dev:web`. The worker executes
recurring expenses, reminders, budget checks, and notification deliveries from
the PostgreSQL-backed job queue; keep it running when testing those flows. Stop
local PostgreSQL with `pnpm docker:db:down`; the named volume preserves data.

Firebase Cloud Messaging and Resend are optional in local development. To test
web push, configure the complete `FCM_*` service-account set and the complete
`VITE_FIREBASE_*` web configuration in `.env`. To test transactional email,
configure `RESEND_API_KEY` and a verified `EMAIL_FROM` identity. Set a distinct
`PUSH_TOKEN_SECRET` to encrypt registered FCM tokens. The application never
returns stored device-token material, and provider delivery remains outside API
request transactions.

## Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:browser
pnpm build
```

The API end-to-end suite requires PostgreSQL. The Playwright suite starts the
web development server and requires a locally installed Chromium browser.

## Database commands

```bash
pnpm db:generate          # regenerate Prisma Client
pnpm db:migrate           # create/apply a development migration
pnpm db:migrate:deploy    # apply committed migrations
pnpm db:seed              # run the idempotent seed entrypoint
pnpm db:studio            # inspect local data
```

Committed migrations are forward-only: never edit one that may have run outside
your branch. Correct a released migration with a new migration. For a disposable
local database only, stop Compose, remove its named volume explicitly, start it
again, and run `pnpm db:migrate:deploy`; this destroys local data and is not a
production recovery procedure.

## Authentication

Google sign-in is handled by the API using Authorization Code with PKCE. The
application stores only its own short-lived, HttpOnly cookie credentials;
Google tokens are discarded after identity validation. Profile, active-session,
export, deactivation, reactivation, and deletion controls are available below
Settings after sign-in.

Read [docs/PROJECT.md](docs/PROJECT.md) before architectural work and [AGENTS.md](AGENTS.md) before using a coding agent.
