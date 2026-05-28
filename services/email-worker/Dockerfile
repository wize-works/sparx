# email-worker runtime image. Same shape as services/media-worker/Dockerfile.
#
# No native deps required — MJML is pure JS, Handlebars is pure JS,
# html-to-text is pure JS. node:24-alpine is plenty.

FROM node:24-alpine

RUN apk add --no-cache dumb-init

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Workspace context — minimum needed to install email-worker + @sparx/db.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/db ./packages/db
COPY services/email-worker ./services/email-worker

# Filtered install pulls only @sparx/email-worker + transitive workspace
# deps; --prod=false keeps tsx + @types/* available for the runtime
# `tsx src/index.ts` entry.
RUN pnpm install --filter @sparx/email-worker... --frozen-lockfile --prod=false

# Generate Prisma client up front so first message doesn't pay the cost.
RUN cd packages/db && pnpm exec prisma generate

WORKDIR /app/services/email-worker

# Run as non-root (GKE Autopilot policy). node:24-alpine ships uid 1000.
RUN chown -R node:node /app
USER node

# dumb-init forwards SIGTERM to the worker's graceful-shutdown hook so a
# pod eviction mid-send finishes in-flight messages before exiting.
ENTRYPOINT ["dumb-init", "--", "pnpm", "exec", "tsx", "src/index.ts"]
