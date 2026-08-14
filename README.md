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

## Installation

```bash
corepack enable
pnpm install
cp .env.example .env
```

The committed example contains local-only credentials. Never commit real secrets.

## Local development

Start PostgreSQL, apply migrations, and launch both applications:

```bash
pnpm docker:db:up
pnpm db:migrate:deploy
pnpm dev
```

- Web: <http://localhost:5173>
- API: <http://localhost:3000>
- PostgreSQL: `localhost:5433` (container port 5432)
- OpenAPI UI: <http://localhost:3000/api/docs>
- Liveness: <http://localhost:3000/health>
- Readiness: <http://localhost:3000/ready>

Run one application with `pnpm dev:api` or `pnpm dev:web`. Stop local PostgreSQL with `pnpm docker:db:down`; the named volume preserves data.

## Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

The end-to-end API suite requires PostgreSQL. Start it and apply migrations first.

## Database commands

```bash
pnpm db:generate          # regenerate Prisma Client
pnpm db:migrate           # create/apply a development migration
pnpm db:migrate:deploy    # apply committed migrations
pnpm db:studio            # inspect local data
```

The first migration will be created with the first real domain model; the bootstrap deliberately has no placeholder tables.

Read [docs/PROJECT.md](docs/PROJECT.md) before architectural work and [AGENTS.md](AGENTS.md) before using a coding agent.
