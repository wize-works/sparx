# api-graphql runtime image. Same shape as services/api-rest/Dockerfile but
# with a narrower workspace context — GraphQL only touches the content
# slice, so we skip CRM/email/auth packages here.
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

# tsx as entrypoint matches the dev script; Fastify handles SIGTERM via the
# graceful-shutdown hook in src/index.ts.
ENTRYPOINT ["pnpm", "exec", "tsx", "src/index.ts"]
