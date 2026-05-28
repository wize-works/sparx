-- Copies every row in `pages` into `content_entries` as type_key='page',
-- and creates one manual revision per entry recording the migrated body.
-- Idempotent via NOT EXISTS guards keyed on (tenant_id, type_key, slug) so
-- re-running the migration after a partial failure picks up where it left
-- off without duplicating rows.
--
-- The `pages` table is NOT dropped here. A follow-up migration
-- (20260528100300_drop_pages — landed in the same PR as the dashboard
-- cutover that stops writing to it) removes it. Keeping pages around for
-- the cutover window is a deliberate rollback affordance.
--
-- Body shape mapping (old → new):
--   pages.title              → entry.body.title
--   pages.content.body       → entry.body.body (rich-text doc wrapper)
--   pages.seo_title          → entry.seo.title
--   pages.meta_description   → entry.seo.description
--   pages.status             → entry.status
--   pages.published_at       → entry.published_at
--
-- Existing dashboard server actions stored content as `{ body: "<plain text>" }`,
-- so we wrap that into a minimal TipTap doc `{ type: 'doc', content: [{ type: 'paragraph', content: [{ type:'text', text: <body> }] }] }`.
-- If `pages.content.body` is missing, the entry body falls back to an empty doc.

INSERT INTO "content_entries" (
    "id", "tenant_id", "type_key", "slug", "status",
    "body", "seo_json", "published_at", "created_at", "updated_at"
)
SELECT
    p.id,
    p.tenant_id,
    'page',
    p.slug,
    p.status,
    jsonb_build_object(
        'title',  p.title,
        'body',
            CASE
                WHEN p.content ? 'body' AND jsonb_typeof(p.content->'body') = 'string'
                    AND length(p.content->>'body') > 0 THEN
                    jsonb_build_object(
                        'type', 'doc',
                        'content', jsonb_build_array(
                            jsonb_build_object(
                                'type', 'paragraph',
                                'content', jsonb_build_array(
                                    jsonb_build_object('type', 'text', 'text', p.content->>'body')
                                )
                            )
                        )
                    )
                ELSE jsonb_build_object('type', 'doc', 'content', '[]'::jsonb)
            END
    ),
    jsonb_strip_nulls(jsonb_build_object(
        'title',       p.seo_title,
        'description', p.meta_description
    )),
    p.published_at,
    p.created_at,
    p.updated_at
FROM "pages" p
WHERE NOT EXISTS (
    SELECT 1 FROM "content_entries" e
    WHERE e.tenant_id = p.tenant_id
      AND e.type_key  = 'page'
      AND e.slug      = p.slug
);

-- Create the first revision per backfilled entry (kind = 'manual', summary
-- describes the import). Skip if any revision already exists for the entry
-- (handles partial reruns).

INSERT INTO "content_revisions" (
    "id", "tenant_id", "entry_id", "revision_number",
    "kind", "body", "seo_json", "status",
    "author_id", "summary", "created_at"
)
SELECT
    gen_random_uuid(),
    e.tenant_id,
    e.id,
    1,
    'manual',
    e.body,
    e.seo_json,
    e.status,
    NULL,
    'Backfilled from pages table',
    e.created_at
FROM "content_entries" e
WHERE e.type_key = 'page'
  AND NOT EXISTS (
    SELECT 1 FROM "content_revisions" r WHERE r.entry_id = e.id
  );
