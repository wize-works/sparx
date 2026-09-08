-- A published post knows when it went live.
--
-- `content_entries.status = 'published'` with `published_at IS NULL` is a row that
-- claims to be live and cannot say since when, and every reader of it fails quietly:
--
--   * the public listing orders by `published_at DESC`, and Postgres sorts NULLs
--     FIRST on a descending order -- so a dateless post outranks every dated one and
--     sits permanently above whatever the shop writes next;
--   * the storefront's post card binds a pre-formatted `date`, which comes out as an
--     empty string, so the card renders a blank line where the date belongs;
--   * the console's content list shows status and not date, so all of them wear the
--     same green "Published" badge and nothing on any screen says which are broken.
--
-- Three write paths were producing them (issue 376): the blueprint installer's entry
-- create, the blueprint updater's merged write, and GraphQL `createEntry`. All three
-- now go through `publishTimestamp` in @wizeworks/cms, which is where the CMS service's
-- own create and publish transitions already had it right.
--
-- BACKFILLED TO `created_at`, not to now. The rows are already published and have been
-- for however long they have been there; stamping them with the deploy time would say
-- every historical post on the platform went live the day this shipped, which is a
-- worse answer than the null. `created_at` is the closest true thing the row knows.
UPDATE "content_entries"
SET "published_at" = "created_at"
WHERE "status" = 'published'
  AND "published_at" IS NULL;

-- And the rule itself, so a future write path that forgets it fails loudly at the
-- point of the mistake rather than shipping an undated post that looks correct on
-- every screen. Only 'published' is constrained: a draft, a scheduled entry and an
-- archived one are all legitimately dateless, and an entry that was published and then
-- taken back to draft keeps the date it had.
ALTER TABLE "content_entries"
  ADD CONSTRAINT "content_entries_published_has_date"
  CHECK ("status" <> 'published' OR "published_at" IS NOT NULL);
