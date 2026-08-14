FROM node:22.16.0-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/prisma.config.ts
COPY apps/web/package.json apps/web/package.json
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN pnpm --filter @splitfinpulse/api db:generate && pnpm --filter @splitfinpulse/api build
RUN pnpm deploy --legacy --filter @splitfinpulse/api --prod /production

FROM node:22.16.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 1001 splitfinpulse \
  && useradd --system --uid 1001 --gid splitfinpulse splitfinpulse
COPY --from=build --chown=splitfinpulse:splitfinpulse /production/node_modules ./node_modules
COPY --from=build --chown=splitfinpulse:splitfinpulse /production/package.json ./package.json
COPY --from=build --chown=splitfinpulse:splitfinpulse /workspace/apps/api/dist ./dist
USER splitfinpulse
EXPOSE 3000
CMD ["node", "dist/main.js"]
