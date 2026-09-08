-- Only a person switches tax collection on.
--
-- `commerce_tax_zones.is_active` carried two different facts in one boolean:
-- "the owner decided this shop must collect here", and "something set this up".
-- Because one column meant both, nothing could tell them apart -- and something
-- had in fact been setting it. The `tax-us-sales` preset, reached from five
-- industry starters, installed California, Texas and New York as
-- `nexus_type = 'physical'`, `is_active = true`. A Denver studio that had never
-- traded outside Colorado was therefore described, three times over, as having a
-- shop, office or staff in states it had never dealt with, and set to collect on
-- that basis (issue 429).
--
-- Collecting sales tax in a state you are not registered in is not a cosmetic
-- mistake. In most US states it is illegal, and the money is neither the
-- shop's to keep nor straightforward to hand back.
--
-- `activated_at` splits the two facts apart. It records the moment a signed-in
-- person switched collection on, and it is set nowhere else: `taxService`
-- refuses to activate a zone for a caller that is not a person, and the CHECK
-- below makes an active-but-unclaimed row impossible for ANY write path --
-- a preset, a blueprint, an importer, a hand-run script, a future service.

ALTER TABLE "commerce_tax_zones"
  ADD COLUMN "activated_at" TIMESTAMPTZ;

-- New zones default to off. A caller that does not mention collection is not
-- asking for it, and absence of a decision must never be stored as one.
ALTER TABLE "commerce_tax_zones"
  ALTER COLUMN "is_active" SET DEFAULT false;

-- ── The backfill, and why it is unconditional ────────────────────────────────
--
-- Every currently active zone is switched off. This is deliberate, and it is
-- safe for a reason that holds on every database rather than on any one of them:
-- `taxService.calculate` had NO CALLERS anywhere in the repo until the fix that
-- ships alongside this migration (issue 428). No shop on this platform has ever
-- charged a cent of sales tax. So there is no collection in progress for this to
-- interrupt, and no merchant has ever seen -- let alone checked -- what their
-- tax settings actually produce at a till.
--
-- What it would interrupt, if it were not run, is the opposite: the deploy that
-- makes tax work would silently start every one of these shops collecting, in
-- states nobody chose, at rates nobody checked.
--
-- Nothing is lost. The place, its rate, its nexus type and its registration
-- number all stay exactly as they are; only the switch moves, and the owner
-- turns back on the places they are actually registered in. The Tax surface
-- explains this in the merchant's own words when it finds places but none of
-- them collecting.
--
-- Written as "has nobody claimed this?" rather than as a one-off sweep, so it
-- states the rule, and so a re-run leaves a zone a person has since switched on
-- untouched.
UPDATE "commerce_tax_zones"
SET "is_active" = false
WHERE "is_active" = true
  AND "activated_at" IS NULL;

-- And the rule itself, at the level nothing can route around. A row may be
-- switched off with or without a history of having been on; it may not be
-- switched ON without a record of the person who did it.
ALTER TABLE "commerce_tax_zones"
  ADD CONSTRAINT "tax_zones_active_needs_a_person"
  CHECK ("is_active" = false OR "activated_at" IS NOT NULL);
