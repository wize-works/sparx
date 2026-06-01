-- Brand content colours (docs/33 §3.1, docs/30 §6): complete the accent `-content`
-- pair and add the secondary identity colour (+ its `-content` override) so the
-- v2 brand token doc can carry every identity slot it already models. All three
-- are optional overrides — null leaves the v2 compiler to auto-derive a content
-- colour and fall secondary back to primary. Additive + nullable, so no backfill;
-- tenant_brands already carries ENABLE+FORCE RLS, so no policy change is needed.
ALTER TABLE "tenant_brands"
  ADD COLUMN "color_accent_foreground" VARCHAR(7),
  ADD COLUMN "color_secondary" VARCHAR(7),
  ADD COLUMN "color_secondary_foreground" VARCHAR(7);
