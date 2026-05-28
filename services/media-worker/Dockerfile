# media-worker runtime image. Same shape as services/api-rest/Dockerfile,
# but with the additional libvips system deps that `sharp` links against
# at runtime. node:24-alpine ships an Alpine 3.20 base which has
# vips-dev as a regular apk package.

FROM node:24-alpine

# sharp@0.34 prefers prebuilt libvips binaries from npm, which work on
# Alpine out of the box once musl + glibc shims are present in the base
# image. Adding the explicit `vips` package buys us the optional codecs
# (heif/avif via libheif) without needing a custom build.
RUN apk add --no-cache vips dumb-init

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Workspace context — minimum needed to install media-worker + @sparx/db.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/db ./packages/db
COPY services/media-worker ./services/media-worker

# Filtered install pulls in only @sparx/media-worker + transitive workspace
# deps; --prod=false is required so the typecheck step downstream has access
# to @types/* and tsx itself.
RUN pnpm install --filter @sparx/media-worker... --frozen-lockfile --prod=false

# Generate Prisma client up front so first message doesn't pay the cost.
RUN cd packages/db && pnpm exec prisma generate

WORKDIR /app/services/media-worker

# Run as non-root (GKE Autopilot policy). node:24-alpine ships uid 1000.
RUN chown -R node:node /app
USER node

# dumb-init forwards SIGTERM to the worker's graceful-shutdown hook so a
# pod eviction during processing finishes the current message before
# exiting.
ENTRYPOINT ["dumb-init", "--", "pnpm", "exec", "tsx", "src/index.ts"]
