# commerce-indexer runtime image. Same shape as services/email-worker/Dockerfile.
#
# Cloud Run Pub/Sub push entrypoint — exposes :8080 (Cloud Run injects
# PORT; defaults to 8080). No native deps required — projection is pure
# JS + Prisma, upserts go over HTTP to Typesense.

FROM node:24-alpine

RUN apk add --no-cache dumb-init

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Workspace context — pulls in the workspace files we filter against
# below. @sparx/commerce drags @sparx/integration-framework + the
# provider packages through its dep tree even though the indexer doesn't
# use them at runtime; the cost is in the Docker layer, not runtime.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY services/commerce-indexer ./services/commerce-indexer

RUN pnpm install --filter @sparx/commerce-indexer... --frozen-lockfile --prod=false

RUN cd packages/db && pnpm exec prisma generate

WORKDIR /app/services/commerce-indexer

RUN chown -R node:node /app
USER node

EXPOSE 8080

# Run tsx directly via node (matches the `start` script), not `pnpm exec` —
# pnpm re-invokes corepack at container start, re-downloading pnpm from the npm
# registry on every cold start (build-time corepack cache is root-owned and
# unreadable by the runtime `node` user). dumb-init forwards SIGTERM to the
# graceful-shutdown hook before exiting.
ENTRYPOINT ["dumb-init", "--", "node", "--import", "tsx/esm", "src/index.ts"]
