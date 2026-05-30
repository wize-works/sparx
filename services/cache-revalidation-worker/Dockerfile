# cache-revalidation-worker runtime image. Same shape as
# services/commerce-indexer/Dockerfile.
#
# Cloud Run Pub/Sub push entrypoint — exposes :8080 (Cloud Run injects PORT;
# defaults to 8080). Only @sparx/db is needed at runtime (tenant id -> slug
# lookup); the storefront POST uses global fetch.

FROM node:24-alpine

RUN apk add --no-cache dumb-init

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Workspace context — minimum needed to install the worker + its workspace deps.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/db ./packages/db
COPY services/cache-revalidation-worker ./services/cache-revalidation-worker

# Filtered install pulls only @sparx/cache-revalidation-worker + transitive
# workspace deps; --prod=false keeps tsx + @types/* for the `tsx src/index.ts`
# entry.
RUN pnpm install --filter @sparx/cache-revalidation-worker... --frozen-lockfile --prod=false

# Generate Prisma client up front so the first message doesn't pay the cost.
RUN cd packages/db && pnpm exec prisma generate

WORKDIR /app/services/cache-revalidation-worker

# Run as non-root (GKE Autopilot policy). node:24-alpine ships uid 1000.
RUN chown -R node:node /app
USER node

EXPOSE 8080

# dumb-init forwards SIGTERM to the graceful-shutdown hook so a Cloud Run
# revision swap finishes in-flight requests before exiting.
ENTRYPOINT ["dumb-init", "--", "pnpm", "exec", "tsx", "src/index.ts"]
