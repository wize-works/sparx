# cache-revalidation-worker

Consumes catalog/content events from Pub/Sub (Cloud Run push), resolves the
event's `tenantId` → storefront slug, and POSTs the storefront's
`/api/revalidate` endpoint so the Next.js Data Cache for that tenant's scope is
purged immediately on a mutation instead of waiting for the TTL.

Mirrors `services/commerce-indexer` (same Cloud Run push entrypoint, OIDC
check, ack/nack model). The scope mapping (`planRevalidation` in
`src/handler.ts`) is a pure function with unit tests.

## Event → scope mapping

| Event prefix                                        | Scope      | Purges (coarse per-tenant tag)      |
| --------------------------------------------------- | ---------- | ----------------------------------- |
| `product.*`, `variant.*`, `inventory.*`, `review.*` | `commerce` | `commerce:<slug>` + `tenant:<slug>` |
| `content.*`, `content_type.*`, `redirect.*`         | `content`  | `content:<slug>`                    |
| `sitebuilder.*`                                     | `site`     | `site:<slug>`                       |

A single coarse `commerce:<slug>` purge clears every commerce read (products,
collections, Q&A) for the tenant — the right blast radius for a catalog edit.

## Status

**Worker code: complete + typechecked + unit-tested + lint-clean.**

**Deploy wiring: NOT yet applied** (requires an infra apply + deploy run I can't
verify locally). To finish wiring the trigger:

1. **Pub/Sub subscriptions** — in `terraform/envs/prod/main.tf`, add
   `"cache-revalidation-worker"` to the subscriber list for each topic:
   `product.created/updated/deleted`, `variant.created/updated/deleted`,
   `inventory.adjusted`, and `content.entry.created/updated/published/`
   `scheduled/unpublished/deleted`, `content_type.upserted`,
   `redirect.added/removed`.
   - `review.*` and `sitebuilder.*` topics don't exist yet (review events
     aren't published; Site Builder ships a noop publisher in Phase 1). When
     they land in the `pubsub.ts` EventType registry + the topics map, the
     handler already maps them — just add the subscriber.
2. **Cloud Run service** — add a `cloud-run-worker` module instance in
   `terraform/envs/prod/serverless.tf` for `cache-revalidation-worker`, with
   env `STOREFRONT_REVALIDATE_URL` (internal storefront URL) +
   `SPARX_REVALIDATE_SECRET` (from Secret Manager) + `PUBSUB_INVOKER_SA`.
3. **Secret** — add `sparx-revalidate-secret` to the `secrets` module
   `secret_ids`, and set the same value as `SPARX_REVALIDATE_SECRET` on the
   **storefront** deployment (`k8s/apps/storefront.yaml`).
4. **Build + deploy** — add `cache-revalidation-worker` to the image matrices
   in `.github/workflows/build-images.yml` and `deploy-prod.yml` (Cloud Run
   workers deploy via the serverless path, per the deploy-workflow split).
5. **Partial wiring is worse than none** — a subscription that pushes to a
   not-yet-deployed service produces delivery errors. Land steps 1–4 together.

Until then: the storefront `/api/revalidate` endpoint is live and the caches
expire on their TTL (commerce 60s, content/tenant/site 300s).
