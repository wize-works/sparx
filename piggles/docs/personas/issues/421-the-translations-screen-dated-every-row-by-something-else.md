# 421 — The translations screen dated every row by something else

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Juniper Row · act 86 · scoring Translations
**Surface:** mypiggles › Content › **Translations** — the Changed column, and the list at 360px
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Two things in the same column, found while checking [420].

**The date was the wrong one.** A column headed **Changed**, sitting immediately
beside **Languages** on a screen called Translations, read
`formatDate(product.updatedAt)` — when the PRODUCT last changed, not when it was
last translated. Proved by saving a Spanish translation of The Everyday Tee on
Sep 5 and watching the row keep saying **Aug 28, 2026**.

It also filled the column for the five products that have never been translated
at all, so a translations worklist showed six dates that mean nothing on it and
two that look like they might.

**And the table scrolled sideways on a phone.** At 360px, measured: **346px of
table inside a 323px box**. The Product cell was capped at a flat `max-w-72`
(288px) — wider than the whole pane — so the mono web address held the column
open. The Languages header, the one column the list exists for, was clipped to
"Language". Status and Changed are hidden at that width and nothing replaced them,
so a phone showed a product name, an address, and a partly cut-off badge.

That is issue [390] again, on a list that never adopted the constant written to
end it. `IDENTITY_CELL`'s own comment says why a fixed cap is wrong here.

## The fix

**The date** — the column is now **Last translated** and reads the newest
`updatedAt` across that product's translation rows (`lastTranslatedAt`, added
alongside the [420] helpers, from data the same query already returned). A product
with no translations shows an em-dash rather than a date about something else.

**The width** — the identity cell uses the shared `IDENTITY_CELL` cap, which
widens with the container (160px on a phone, 288px at full width) instead of
sitting at 288px everywhere. sparx has no shared table wrapper, so it carries the
same value as a local constant with the same reasoning written above it.

**And nothing disappears on a phone.** The status badge and the translated date
now ride under the name below `@2xl`, the way `page-row.tsx` already does it — so
the two facts a worklist is read for stay on the row at every width.

## Proved, on the same screen

Measured again at 360px in an injected iframe: **323px of table in a 323px box**,
`scrollWidth === clientWidth`, no sideways scroll. Both headers read in full. Each
row carries its name, a truncated address, its **On sale** badge, **Translated Sep
5, 2026**, and its language badge.

And the column tells the truth: the five untranslated products read an em-dash,
and The Everyday Tee — translated today, product last edited Aug 28 — reads
**Sep 5, 2026**.

## Not fixed, and not a defect

A product edited AFTER its translation was written leaves the translation
describing something else. Nothing on this screen says so, and both dates are now
in hand to work it out. That is a new capability rather than a defect, so it is
named in the pane's gap to 10 instead of being built here.

## Rating effect

Feeds `cms.translations` — see [rating.md](../rating.md).
