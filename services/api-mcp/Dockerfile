# api-mcp runtime image. Same shape as services/api-rest/Dockerfile.
#
# Built by GitHub Actions, pushed to
# us-central1-docker.pkg.dev/sparxworks/sparx/api-mcp:<sha>.

FROM node:24-alpine

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Workspace context. Only the packages api-mcp transitively depends on are
# copied in so `pnpm install --filter` doesn't drag the entire monorepo
# into the image.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/db ./packages/db
COPY packages/auth ./packages/auth
COPY packages/events ./packages/events
COPY packages/email ./packages/email
COPY packages/crm-schemas ./packages/crm-schemas
COPY packages/crm ./packages/crm
COPY packages/storefront-themes ./packages/storefront-themes
COPY packages/sitebuilder-schemas ./packages/sitebuilder-schemas
COPY packages/sitebuilder ./packages/sitebuilder
COPY packages/cms-editor ./packages/cms-editor
COPY packages/email-platform ./packages/email-platform
COPY services/api-mcp ./services/api-mcp

RUN pnpm install --filter @sparx/api-mcp... --frozen-lockfile --prod=false

# Pre-generate the Prisma client so the first MCP tool call doesn't pay
# the cost. @sparx/crm services hit prisma via @sparx/db's tenant-scoped
# helpers — the audit-log write goes through the same connection.
RUN cd packages/db && pnpm exec prisma generate

WORKDIR /app/services/api-mcp

# GKE Autopilot enforces runAsNonRoot — node:24-alpine ships uid 1000.
RUN chown -R node:node /app
USER node

EXPOSE 3000

ENTRYPOINT ["pnpm", "exec", "tsx", "src/index.ts"]
