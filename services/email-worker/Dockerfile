# email-worker runtime image. Same shape as services/media-worker/Dockerfile.
#
# Cloud Run Pub/Sub push entrypoint — exposes :8080 (Cloud Run injects
# PORT; defaults to 8080). No native deps required — React Email renders
# pure JS strings.

FROM node:24-alpine

RUN apk add --no-cache dumb-init

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Workspace context — minimum needed to install email-worker + its workspace
# deps (@sparx/db for runtime + @sparx/email for templates/render/provider).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/db ./packages/db
COPY packages/email ./packages/email
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

EXPOSE 8080

# dumb-init forwards SIGTERM to the worker's graceful-shutdown hook so a
# Cloud Run revision swap mid-send finishes in-flight requests before
# exiting.
ENTRYPOINT ["dumb-init", "--", "pnpm", "exec", "tsx", "src/index.ts"]
