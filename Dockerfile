# API image when Fly Launch / deploy uses **repo root** as build context.
# Preferred CLI deploy remains: `cd backend && fly deploy`
# See docs: backend/docs/release/FLY-DEPLOY.md

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /app

FROM base AS deps
COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml backend/tsconfig.json backend/tsconfig.base.json ./
COPY backend/apps/api ./apps/api
COPY backend/packages ./packages
COPY backend/modules ./modules
RUN pnpm install --frozen-lockfile

FROM base AS runner
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="/app/node_modules/.bin:$PNPM_HOME:$PATH"
WORKDIR /app
COPY --from=deps /app /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
EXPOSE 3000
USER node
CMD ["node", "--import", "tsx", "apps/api/src/main.ts"]
