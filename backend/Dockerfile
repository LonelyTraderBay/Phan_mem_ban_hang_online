# Multi-stage image for Nest API (apps/api) — pnpm workspace, Node 24.
# Runtime: `pnpm exec tsx apps/api/src/main.ts`
# Build context: backend/

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages
COPY modules ./modules
RUN pnpm install --frozen-lockfile

FROM base AS runner
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="/app/node_modules/.bin:$PNPM_HOME:$PATH"
WORKDIR /app
COPY --from=deps /app /app
# Avoid corepack re-download at boot (Fly health checks race cold start).
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
EXPOSE 3000
USER node
CMD ["node", "--import", "tsx", "apps/api/src/main.ts"]
