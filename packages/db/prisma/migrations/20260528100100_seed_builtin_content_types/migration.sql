-- Bootstrap the six built-in CMS content types under the sentinel Sparx
-- Platform tenant. The TS source of truth lives at
-- packages/cms-schemas/src/builtins/* — the api-rest service will idempotently
-- re-upsert these rows on every boot so the DB tracks the code. This
-- migration just establishes the rows on a cold-start DB before api-rest
-- runs.
--
-- The platform tenant row (00000000-0000-0000-0000-000000000000) was
-- inserted by 20260528100000_unified_content_model. RLS on content_types
-- allows writes only where tenant_id = current_tenant_id(), so we set the
-- GUC to the platform tenant for the duration of this migration.

SET LOCAL app.tenant_id = '00000000-0000-0000-0000-000000000000';

-- ─────────────────────────────────────────────────────────────────────────
-- page
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO "content_types" (
    "id", "tenant_id", "key", "name", "plural_name", "description",
    "schema_json", "url_pattern", "icon", "is_singleton", "is_built_in"
) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'page',
    'Page',
    'Pages',
    'Static page like About, Contact, or a landing page.',
    $json${
      "fields": [
        { "key": "title", "type": "text", "label": "Title", "required": true, "max": 255 },
        { "key": "body", "type": "rich_text", "label": "Body", "required": true },
        { "key": "excerpt", "type": "long_text", "label": "Excerpt", "max": 500,
          "helpText": "Plain-text summary used in search results, feeds, and OG cards when no description is set." },
        { "key": "featuredImage", "type": "asset", "label": "Featured image", "accept": ["image/*"] }
      ]
    }$json$::jsonb,
    '/{slug}',
    'file-text',
    FALSE,
    TRUE
)
ON CONFLICT ("tenant_id", "key") DO UPDATE SET
    "name"         = EXCLUDED."name",
    "plural_name"  = EXCLUDED."plural_name",
    "description"  = EXCLUDED."description",
    "schema_json"  = EXCLUDED."schema_json",
    "url_pattern"  = EXCLUDED."url_pattern",
    "icon"         = EXCLUDED."icon",
    "is_singleton" = EXCLUDED."is_singleton",
    "is_built_in"  = EXCLUDED."is_built_in",
    "updated_at"   = NOW();

-- ─────────────────────────────────────────────────────────────────────────
-- blog_post
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO "content_types" (
    "id", "tenant_id", "key", "name", "plural_name", "description",
    "schema_json", "url_pattern", "icon", "is_singleton", "is_built_in"
) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'blog_post',
    'Blog post',
    'Blog posts',
    'Authored article with excerpt, featured image, and rich body.',
    $json${
      "fields": [
        { "key": "title", "type": "text", "label": "Title", "required": true, "max": 255 },
        { "key": "excerpt", "type": "long_text", "label": "Excerpt", "required": true, "max": 500,
          "helpText": "Shown on index pages, in RSS, and in search results." },
        { "key": "body", "type": "rich_text", "label": "Body", "required": true },
        { "key": "featuredImage", "type": "asset", "label": "Featured image", "accept": ["image/*"] }
      ]
    }$json$::jsonb,
    '/blog/{slug}',
    'newspaper',
    FALSE,
    TRUE
)
ON CONFLICT ("tenant_id", "key") DO UPDATE SET
    "name"         = EXCLUDED."name",
    "plural_name"  = EXCLUDED."plural_name",
    "description"  = EXCLUDED."description",
    "schema_json"  = EXCLUDED."schema_json",
    "url_pattern"  = EXCLUDED."url_pattern",
    "icon"         = EXCLUDED."icon",
    "is_singleton" = EXCLUDED."is_singleton",
    "is_built_in"  = EXCLUDED."is_built_in",
    "updated_at"   = NOW();

-- ─────────────────────────────────────────────────────────────────────────
-- feature
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO "content_types" (
    "id", "tenant_id", "key", "name", "plural_name", "description",
    "schema_json", "url_pattern", "icon", "is_singleton", "is_built_in"
) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'feature',
    'Feature',
    'Features',
    'A single numbered feature card linked from a module page or other section.',
    $json${
      "fields": [
        { "key": "number", "type": "text", "label": "Number", "required": true, "max": 4,
          "helpText": "Two-digit ordinal, e.g. \"01\"." },
        { "key": "title", "type": "text", "label": "Title", "required": true, "max": 120 },
        { "key": "body", "type": "long_text", "label": "Body", "required": true, "max": 600 },
        { "key": "icon", "type": "text", "label": "Icon", "max": 40,
          "helpText": "Lucide icon name (optional)." }
      ]
    }$json$::jsonb,
    NULL,
    'sparkles',
    FALSE,
    TRUE
)
ON CONFLICT ("tenant_id", "key") DO UPDATE SET
    "name"         = EXCLUDED."name",
    "plural_name"  = EXCLUDED."plural_name",
    "description"  = EXCLUDED."description",
    "schema_json"  = EXCLUDED."schema_json",
    "url_pattern"  = EXCLUDED."url_pattern",
    "icon"         = EXCLUDED."icon",
    "is_singleton" = EXCLUDED."is_singleton",
    "is_built_in"  = EXCLUDED."is_built_in",
    "updated_at"   = NOW();

-- ─────────────────────────────────────────────────────────────────────────
-- faq_item
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO "content_types" (
    "id", "tenant_id", "key", "name", "plural_name", "description",
    "schema_json", "url_pattern", "icon", "is_singleton", "is_built_in"
) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'faq_item',
    'FAQ item',
    'FAQ items',
    'A single question-and-answer pair.',
    $json${
      "fields": [
        { "key": "question", "type": "text", "label": "Question", "required": true, "max": 280 },
        { "key": "answer", "type": "rich_text", "label": "Answer", "required": true },
        { "key": "category", "type": "text", "label": "Category", "max": 60,
          "helpText": "Optional grouping label shown above the question in the FAQ index." },
        { "key": "order", "type": "number", "label": "Order", "integer": true,
          "helpText": "Lower numbers appear first within a category." }
      ]
    }$json$::jsonb,
    NULL,
    'circle-help',
    FALSE,
    TRUE
)
ON CONFLICT ("tenant_id", "key") DO UPDATE SET
    "name"         = EXCLUDED."name",
    "plural_name"  = EXCLUDED."plural_name",
    "description"  = EXCLUDED."description",
    "schema_json"  = EXCLUDED."schema_json",
    "url_pattern"  = EXCLUDED."url_pattern",
    "icon"         = EXCLUDED."icon",
    "is_singleton" = EXCLUDED."is_singleton",
    "is_built_in"  = EXCLUDED."is_built_in",
    "updated_at"   = NOW();

-- ─────────────────────────────────────────────────────────────────────────
-- editorial_section
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO "content_types" (
    "id", "tenant_id", "key", "name", "plural_name", "description",
    "schema_json", "url_pattern", "icon", "is_singleton", "is_built_in"
) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'editorial_section',
    'Editorial section',
    'Editorial sections',
    'Embeddable long-form marketing block — spotlight, callout, or pitch panel.',
    $json${
      "fields": [
        { "key": "key", "type": "text", "label": "Section key", "required": true, "max": 60,
          "helpText": "Stable identifier the consuming page references, e.g. \"mcp_spotlight\"." },
        { "key": "eyebrow", "type": "text", "label": "Eyebrow", "max": 80 },
        { "key": "headline", "type": "text", "label": "Headline", "required": true, "max": 200 },
        { "key": "body", "type": "rich_text", "label": "Body", "required": true },
        { "key": "ctaLabel", "type": "text", "label": "CTA label", "max": 60 },
        { "key": "ctaUrl", "type": "url", "label": "CTA URL" },
        { "key": "accentImage", "type": "asset", "label": "Accent image", "accept": ["image/*"] }
      ]
    }$json$::jsonb,
    NULL,
    'panel-top',
    FALSE,
    TRUE
)
ON CONFLICT ("tenant_id", "key") DO UPDATE SET
    "name"         = EXCLUDED."name",
    "plural_name"  = EXCLUDED."plural_name",
    "description"  = EXCLUDED."description",
    "schema_json"  = EXCLUDED."schema_json",
    "url_pattern"  = EXCLUDED."url_pattern",
    "icon"         = EXCLUDED."icon",
    "is_singleton" = EXCLUDED."is_singleton",
    "is_built_in"  = EXCLUDED."is_built_in",
    "updated_at"   = NOW();

-- ─────────────────────────────────────────────────────────────────────────
-- module
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO "content_types" (
    "id", "tenant_id", "key", "name", "plural_name", "description",
    "schema_json", "url_pattern", "icon", "is_singleton", "is_built_in"
) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'module',
    'Module',
    'Modules',
    'Marketing page for one Sparx product module.',
    $json${
      "fields": [
        { "key": "label", "type": "text", "label": "Eyebrow label", "required": true, "max": 60,
          "helpText": "Short chip above the headline, e.g. \"AI · MCP\"." },
        { "key": "moduleKey", "type": "enum", "label": "Module key", "required": true,
          "options": [
            { "value": "storefront", "label": "Storefront" },
            { "value": "commerce",   "label": "Commerce" },
            { "value": "cms",        "label": "CMS" },
            { "value": "crm",        "label": "CRM" },
            { "value": "email",      "label": "Email" },
            { "value": "b2b",        "label": "B2B" },
            { "value": "ai",         "label": "AI · MCP" },
            { "value": "dropship",   "label": "Dropship" }
          ],
          "helpText": "Drives ModuleProvider theme color and the marketing URL slug." },
        { "key": "headlinePrimary", "type": "text", "label": "Headline (primary)", "required": true, "max": 120 },
        { "key": "headlineSecondary", "type": "text", "label": "Headline (secondary)", "required": true, "max": 120 },
        { "key": "title", "type": "text", "label": "Page title", "required": true, "max": 120,
          "helpText": "Used in <title> and OG cards." },
        { "key": "description", "type": "long_text", "label": "Meta description", "required": true, "max": 280 },
        { "key": "lede", "type": "long_text", "label": "Hero lede", "required": true, "max": 600 },
        { "key": "features", "type": "reference", "label": "Features",
          "to": "feature", "multiple": true, "min": 1, "max": 12 },
        { "key": "pricing", "type": "object", "label": "Pricing", "required": true,
          "fields": [
            { "key": "price",  "type": "text", "label": "Price",  "required": true, "max": 20 },
            { "key": "period", "type": "text", "label": "Period", "required": true, "max": 20 },
            { "key": "modifier", "type": "enum", "label": "Modifier", "required": true,
              "options": [
                { "value": "standalone", "label": "Standalone" },
                { "value": "additive",   "label": "Additive (+)" }
              ],
              "helpText": "Standalone for modules that can run alone; additive for modules that activate on top of Storefront." },
            { "key": "bundleNote", "type": "long_text", "label": "Bundle note", "required": true, "max": 600 }
          ]
        },
        { "key": "marketingDomain", "type": "url", "label": "Marketing domain",
          "helpText": "Optional dedicated site for this module, e.g. sparxcms.com." }
      ]
    }$json$::jsonb,
    '/{slug}',
    'layout-grid',
    FALSE,
    TRUE
)
ON CONFLICT ("tenant_id", "key") DO UPDATE SET
    "name"         = EXCLUDED."name",
    "plural_name"  = EXCLUDED."plural_name",
    "description"  = EXCLUDED."description",
    "schema_json"  = EXCLUDED."schema_json",
    "url_pattern"  = EXCLUDED."url_pattern",
    "icon"         = EXCLUDED."icon",
    "is_singleton" = EXCLUDED."is_singleton",
    "is_built_in"  = EXCLUDED."is_built_in",
    "updated_at"   = NOW();
