# 385 — Her clothing shop was filed under Venture capital and Data centres

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · opening Tags and topics for the first time
**Surface:** mypiggles › Content › Tags and topics (and each vocabulary's own pane)
**Filed:** 2026-09-01
**Fixed:** 2026-09-01
**Confirmed by:** the same screen on three of her seven sites, each now showing its own labels

## What happened

Devi cuts and sews womenswear in Denver. Standing in **Juniper Row**, her shop,
she opened Tags and topics and found two ways of filing holding **32 labels**:

| Categories              | Tags                                      |
| ----------------------- | ----------------------------------------- |
| Artificial intelligence | Aurora · Nimbus · Chips · Batteries       |
| Climate tech            | **Data centres** · Energy · Regulation    |
| Startups                | Manufacturing · Venture capital · Print   |
| Hardware · Policy       | Deck · Field Kit · Observation · Cities   |
| Reporting · Fiction     | Attention · Books · Short story · Reading |

Not one of them is about clothing. They are a technology publication's filing
system, and they had arrived that day when she added two designs to two of her
**other** sites.

Standing in her shop, the screen showed her the Press site's vocabulary. Standing
on Sample Sale, it showed the identical two rows and the identical counts. **The
screen was the same on all seven of her websites**, and the database says Juniper
Row owned **none** of the 32.

## Why it happened

The model is not ambiguous. `TaxonomyTerm.propertyId` carries this comment:

> null = the term appears on every site. Unlike its Taxonomy, **a TERM is
> CONTENT** — "Diesel repair" is meaningless on a donut site, and it would
> otherwise show up in that site's category filters and archive pages.

And on its cascade rule:

> a term written for one business is that business's editorial vocabulary.
> SetNull would promote it to every site — **putting "Diesel repair" in the donut
> shop's category list, which is the defect this fixes.**

The columns shipped. The indexes shipped, including
`@@index([tenantId, propertyId, taxonomyId])` — an index built for a query that
was never written. The blueprint installer stamped the column faithfully, so the
data was correct all along: 25 terms belonged to Sample Sale, 7 to Press, 0 to
Juniper Row.

**And not one read in the 310-line taxonomies route mentioned `property`.** The
model was declared and never implemented, so the screen answered a
whole-business question on a per-site surface. Platform-wide, 32 of 37 terms are
scoped to a site and every one of them was shown everywhere.

This is [[feedback_absent_behaves_like_fine]] at the level of a whole feature: a
filter that is missing looks exactly like a filter that passes everything.

## The fix

Reads are scoped and writes are stamped, so the model is implemented rather than
merely declared:

| Route                      | Now                                                      |
| -------------------------- | -------------------------------------------------------- |
| list the vocabularies      | unscoped — a taxonomy is a schema, and shared is correct |
| the label count on each    | this site's labels                                       |
| list a vocabulary's labels | this site's, plus any belonging to every site            |
| add a label                | stamped with the site it was written on                  |
| rename or delete a label   | refuses one this site cannot see                         |

**The delete confirmation needed the opposite number, and would otherwise have
gone quiet.** A vocabulary is shared, so deleting it destroys every site's labels
at once — and the site being worked in is routinely the one holding none of them.
Scoping the count alone would have turned "and all 19 of its labels" into
silence on the exact screen where the warning matters most. The API now serves
both: `term_count` for the list, `all_sites_term_count` for the warning, which
reads

> This removes this way of filing from every one of your websites, along with all
> 19 of its labels — 19 of them are on your other sites — and takes those labels
> off any content using them. This cannot be undone.

**Scoping the read created one new failure, so it is answered too.** A label's
web address stays unique per vocabulary by deliberate design (two sites owning
`/specials` would make that address ambiguous), which means a clash can now be
with a label she cannot see. The refusal names the site:

> "Craft" on Juniper Row Sample Sale already uses the web address "craft", and a
> label's address has to be unique across your whole business. Give this one a
> different one.

**And the list stopped speaking to developers.** Its three note columns read
`Key` over a bare `blog_category` in monospace, `Structure` over the word "Flat",
and `Terms` over a number — while the editor one click away already calls the
same three things **Reference** ("the code that connects this to your content"),
**Allow nesting** ("when off, they are a plain list") and "the individual
**labels** inside this", and explains each. The list now uses the editor's words.

## Confirming it

Driven as Devi on three of her sites:

| Standing on             | Was     | Now         | The truth |
| ----------------------- | ------- | ----------- | --------- |
| Juniper Row (her shop)  | 13 · 19 | **0 · 0**   | 0 · 0     |
| Juniper Row Press       | 13 · 19 | **3 · 4**   | 3 · 4     |
| Juniper Row Sample Sale | 13 · 19 | **10 · 15** | 10 · 15   |

Then wrote her first real tag on Juniper Row — **Knitwear** — and confirmed in the
database that it belongs to Juniper Row rather than to every site. Then typed
**Craft**, which Sample Sale owns, and read the refusal naming Sample Sale. Then
opened Delete and read the warning about all 19 labels before pressing Keep it;
2 vocabularies and 32 terms all still present.

**Five integration tests.** Proved red: with the scope predicate returning `{}`
again, three of the five fail.

## Still open

- **Nothing offers to move a label to another site.** She can create one where
  she is standing and delete it, but a tag written on the wrong site has to be
  retyped. The column exists; no screen edits it.
- **The 32 labels are still there**, correctly filed under the two sites that
  introduced them. They are no longer in her shop's way, but nothing tells her a
  design put them there, and removing a design's labels is one at a time.
- **A label does not say what it is used on.** The editor lists names and web
  addresses; a label on nothing looks identical to one on nine articles, which is
  the same shape as [[382]] one module over.
- **"Data centres" is British spelling in a public web address** (`/data-centres`)
  and came from the design catalog, not from her. Same family as [[384]], but in
  blueprint content rather than console copy.
