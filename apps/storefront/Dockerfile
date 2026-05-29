# syntax=docker/dockerfile:1.7
#
# Multi-stage Next.js build for the @sparx/storefront tenant storefront.
# Mirrors apps/web/Dockerfile — same standalone output shape.
#
# Built from the repo root context (per .github/workflows/build-images.yml):
#   docker build -f apps/storefront/Dockerfile -t sparx/storefront:tag .

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# ----- Install + build -----
FROM base AS builder

# Workspace metadata first — maximises layer cache reuse across source changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/storefront/package.json apps/storefront/
COPY packages/ui/package.json packages/ui/
COPY packages/cms-editor/package.json packages/cms-editor/

# Install only the @sparx/storefront subgraph (its deps + transitive workspace deps).
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @sparx/storefront...

COPY packages/ui packages/ui
COPY packages/cms-editor packages/cms-editor
COPY apps/storefront apps/storefront

# next.config.mjs has `output: 'standalone'` and outputFileTracingRoot
# pointing at the monorepo root for this to work.
RUN pnpm --filter @sparx/storefront build

# ----- Production runner -----
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# Standalone bundle includes the minimal node_modules + server.js for the app.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/storefront/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/storefront/.next/static ./apps/storefront/.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "apps/storefront/server.js"]
