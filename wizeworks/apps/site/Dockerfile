# syntax=docker/dockerfile:1.7
#
# Multi-stage Next.js build for the @wizeworks/site tenant storefront.
# Mirrors sparx/apps/web/Dockerfile — same standalone output shape.
#
# Built from the repo root context (per .github/workflows/build-images-gcp.yml):
#   docker build -f wizeworks/apps/site/Dockerfile -t sparx/storefront:tag .

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# ----- Install + build -----
FROM base AS builder

# Workspace metadata first — maximises layer cache reuse across source changes.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY wizeworks/apps/site/package.json wizeworks/apps/site/
COPY wizeworks/packages/app-kit/package.json wizeworks/packages/app-kit/
COPY wizeworks/packages/brand-core/package.json wizeworks/packages/brand-core/
COPY wizeworks/packages/ui/package.json wizeworks/packages/ui/
COPY wizeworks/packages/cms-editor/package.json wizeworks/packages/cms-editor/
COPY wizeworks/packages/site-themes/package.json wizeworks/packages/site-themes/
COPY wizeworks/packages/sitebuilder-schemas/package.json wizeworks/packages/sitebuilder-schemas/
COPY wizeworks/packages/section-template-react/package.json wizeworks/packages/section-template-react/
COPY wizeworks/packages/builder-schemas/package.json wizeworks/packages/builder-schemas/
# @wizeworks/silica-catalog — the silica-native domain catalog the storefront renders
# published silica pages through (docs/118). Only npm dep is silicaui-html; no
# workspace deps of its own.
COPY wizeworks/packages/silica-catalog/package.json wizeworks/packages/silica-catalog/
COPY wizeworks/packages/silica-corrections/package.json wizeworks/packages/silica-corrections/
# @wizeworks/builder-render — the shared canvas↔live render path (docs/builder/02); the
# live storefront renders through it. Its workspace deps (builder-schemas,
# cms-editor) are above.
COPY wizeworks/packages/builder-render/package.json wizeworks/packages/builder-render/
COPY wizeworks/packages/chat-widget/package.json wizeworks/packages/chat-widget/
# @wizeworks/commerce-schemas — shared selling vocabulary (carrier labels on the
# order timeline). It pulls crm-schemas, automation-schemas and field-schema in
# turn, so all four have to be present for the install to resolve.
COPY wizeworks/packages/commerce-schemas/package.json wizeworks/packages/commerce-schemas/
COPY wizeworks/packages/crm-schemas/package.json wizeworks/packages/crm-schemas/
COPY wizeworks/packages/automation-schemas/package.json wizeworks/packages/automation-schemas/
COPY wizeworks/packages/field-schema/package.json wizeworks/packages/field-schema/

# Install only the @wizeworks/site subgraph (its deps + transitive workspace deps).
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @wizeworks/site...

COPY wizeworks/packages/app-kit wizeworks/packages/app-kit
COPY wizeworks/packages/brand-core wizeworks/packages/brand-core
COPY wizeworks/packages/ui wizeworks/packages/ui
COPY wizeworks/packages/cms-editor wizeworks/packages/cms-editor
COPY wizeworks/packages/site-themes wizeworks/packages/site-themes
COPY wizeworks/packages/sitebuilder-schemas wizeworks/packages/sitebuilder-schemas
COPY wizeworks/packages/section-template-react wizeworks/packages/section-template-react
COPY wizeworks/packages/builder-schemas wizeworks/packages/builder-schemas
COPY wizeworks/packages/silica-catalog wizeworks/packages/silica-catalog
COPY wizeworks/packages/silica-corrections wizeworks/packages/silica-corrections
COPY wizeworks/packages/builder-render wizeworks/packages/builder-render
COPY wizeworks/packages/chat-widget wizeworks/packages/chat-widget
COPY wizeworks/packages/commerce-schemas wizeworks/packages/commerce-schemas
COPY wizeworks/packages/crm-schemas wizeworks/packages/crm-schemas
COPY wizeworks/packages/automation-schemas wizeworks/packages/automation-schemas
COPY wizeworks/packages/field-schema wizeworks/packages/field-schema
COPY wizeworks/apps/site wizeworks/apps/site

# Stripe.js publishable key. `NEXT_PUBLIC_*` is INLINED INTO THE CLIENT BUNDLE AT
# BUILD TIME — setting it on the running pod does nothing, so it has to arrive as a
# build-arg here (wired from the repo variable in build-images-gcp.yml). Without it the
# checkout's Payment Element never mounts and every tenant storefront shows
# "Payments aren't configured for this store yet". This is the PLATFORM key: sparx
# Pay's intents are destination charges on sparx's own account, so the platform key
# is the right one to confirm them with. A `stripe_direct` tenant's intent lives on
# THEIR account and is confirmed with THEIR publishable key, which the payment-intent
# response carries per-request (see wizeworks/packages/payments/src/gateways/stripe-direct.ts).
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# Public API base URL — same build-time inlining rule as the Stripe key above. The
# CLIENT components (cart, mini-cart, order summary — all 'use client') build storefront
# media URLs via lib/media's `mediaUrl`, which reads NEXT_PUBLIC_API_URL. Without it in
# the bundle, mediaUrl falls back to http://localhost:3100, so on an HTTPS storefront the
# browser blocks the image as mixed content AND raises a Chrome Private-Network-Access
# permission prompt on add-to-cart (the mini-cart image is a local-network request).
# Server components read SPARX_API_REST_URL at runtime and are unaffected.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# next.config.mjs has `output: 'standalone'` and outputFileTracingRoot
# pointing at the monorepo root for this to work.
RUN pnpm --filter @wizeworks/site build

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
COPY --from=builder --chown=nextjs:nodejs /repo/wizeworks/apps/site/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/wizeworks/apps/site/.next/static ./wizeworks/apps/site/.next/static
# public/ is NOT bundled into standalone output — copy it explicitly so the
# default favicon fallback (favicon.ico, sparx-icon.svg) serves.
COPY --from=builder --chown=nextjs:nodejs /repo/wizeworks/apps/site/public ./wizeworks/apps/site/public

# Next's incremental data cache lives at <distDir>/cache (wizeworks/apps/site/.next/cache).
# The standalone output ships .next/{standalone,static} but NOT a cache dir, so
# at runtime the dir is absent — Next can't read/write the fetch Data Cache, which
# silently degrades `next: { revalidate }` fetches. Create it writable up front.
RUN mkdir -p ./wizeworks/apps/site/.next/cache \
 && chown -R nextjs:nodejs ./wizeworks/apps/site/.next

USER nextjs

EXPOSE 3000

CMD ["node", "wizeworks/apps/site/server.js"]
