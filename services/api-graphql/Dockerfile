# api-graphql runtime image. Same shape as services/api-rest/Dockerfile.
#
# CRM resolvers depend on @sparx/crm → @sparx/auth → @sparx/email +
# @sparx/events, so all four must be COPY'd into the image even though the
# GraphQL surface itself doesn't import them directly.
#
# Built by GitHub Actions, pushed to
# us-central1-docker.pkg.dev/sparxworks/sparx/api-graphql:<sha>.

FROM node:24-alpine

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Workspace context — minimum needed for @sparx/api-graphql to install.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/db ./packages/db
COPY packages/api-core ./packages/api-core
COPY packages/cms-schemas ./packages/cms-schemas
COPY packages/events ./packages/events
COPY packages/email ./packages/email
COPY packages/auth ./packages/auth
COPY packages/crm-schemas ./packages/crm-schemas
COPY packages/crm ./packages/crm
COPY services/api-graphql ./services/api-graphql

# Install only what api-graphql needs (and transitive workspace deps).
RUN pnpm install --filter @sparx/api-graphql... --frozen-lockfile --prod=false

# Pre-generate the Prisma client so the first request doesn't pay the cost.
RUN cd packages/db && pnpm exec prisma generate

WORKDIR /app/services/api-graphql

# k8s SecurityContext requires runAsNonRoot. node:24-alpine ships a `node`
# user (uid 1000) which satisfies the GKE Autopilot policy.
RUN chown -R node:node /app
USER node

EXPOSE 3200

# Run tsx directly via node (matches the `start` script), not via `pnpm exec`,
# which re-invokes corepack at container start and re-downloads pnpm from the
# npm registry on every cold start (the build-time corepack cache is owned by
# root, unreadable by the runtime `node` user). Fastify handles SIGTERM via the
# graceful-shutdown hook in src/index.ts.
ENTRYPOINT ["node", "--import", "tsx", "src/index.ts"]
