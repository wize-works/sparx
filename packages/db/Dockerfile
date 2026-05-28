# Migration runner image. Built by GitHub Actions, pushed to Artifact Registry
# at us-central1-docker.pkg.dev/sparxworks/sparx/db-migrate:<sha>, and run as
# the main container of a K8s Job in sparx-prod alongside the Cloud SQL Auth
# Proxy sidecar.
#
# Single-stage build keeps the image self-contained — the runtime needs the
# Prisma CLI (for `prisma migrate deploy` and `prisma db execute`), the
# generated client, tsx (for the seed), and the @google-cloud/secret-manager
# client to fetch DB passwords via Workload Identity.

FROM node:24-alpine

# pnpm via corepack — matches the monorepo's packageManager declaration.
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Workspace context: copy just enough of the monorepo for `pnpm install
# --filter @sparx/db` to work without pulling the world.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/db ./packages/db

# Install only @sparx/db deps; --frozen-lockfile fails the build if anyone
# forgot to commit a lockfile update.
RUN pnpm install --filter @sparx/db... --frozen-lockfile --prod=false

# Generate the Prisma client so `prisma migrate deploy` and the seed run
# against the embedded schema.
RUN cd packages/db && pnpm exec prisma generate

WORKDIR /app/packages/db

# Drop to the node:24-alpine image's built-in `node` user (uid 1000) so the
# K8s pod's runAsNonRoot security context is satisfied. Done AFTER pnpm
# install + prisma generate which need root to write into /app. chown the
# tree so the entrypoint can read the generated client + node_modules.
RUN chown -R node:node /app
USER node

# tini-style sane signal handling for K8s SIGTERM.
ENTRYPOINT ["pnpm", "exec", "tsx", "scripts/run-migrations.ts"]
