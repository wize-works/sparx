# 387 — Nine strangers were the only names she could put on her own writing

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · opening Authors on her shop, one screen after [[385]]
**Surface:** mypiggles › Content › Authors (and the byline picker inside every post)
**Filed:** 2026-09-01
**Fixed:** 2026-09-01
**Confirmed by:** three of her seven sites, each now showing its own masthead

## What happened

Devi sews womenswear in Denver. She opened **Authors** on Juniper Row, her shop,
and found nine people:

| Name            | Their biography begins           |
| --------------- | -------------------------------- |
| Dana Ruiz       | "covers artificial intelligence" |
| Marcus Bell     | "writes about startups"          |
| Priya Anand     | "reports on technology policy"   |
| Eleanor Vance   | "writes essays and criticism"    |
| Julian Mercer   | "is a reporter at large"         |
| Sofia Adeyemi   | "is a fiction writer"            |
| Mara Reyes      | "founded Launch Notes"           |
| Daniel Okafor   | "leads product design"           |
| Sofia Lindqvist | "runs hardware at Launch Notes"  |

Not one of them writes for her. They are two magazine designs' mastheads, and the
database says **zero** of the nine belonged to Juniper Row: six were Sample
Sale's, three were Press's.

**And this one is not cosmetic, which is what separates it from [[385]] one
screen over.** The same list feeds the **byline picker** inside the content
editor, so those nine were the only names she could put on her own writing. Her
shop has six published journal posts — _The case for fewer clothes_, _How to read
a fabric_, _Caring for knitwear_ — and **every one of them has no author at all**,
because the only alternative was to sign her work with a stranger's name.

## Why it happened

The model is not ambiguous. `Author.propertyId` carries this comment:

> The publication this byline belongs to (docs/131 §4); null = every site. An
> author is a **PUBLIC PERSONA**, not a login … The same person can write as
> "Bob, master machinist" on one site and under a plain name on another, and
> **neither byline (nor its bio and avatar) belongs in the other publication's
> author picker.**

The column shipped with migration 20261227. Its index shipped too —
`@@index([tenantId, propertyId])`, built for a query nothing ever made. The
blueprint installer stamped the column faithfully, so the data was right all
along.

**And not one read in the 217-line authors route mentioned `property`.** Both
consumers — the Authors list and the byline picker — hit the same unscoped
`GET /v1/authors`, so fixing the route fixed all three screens at once.

`docs/131` lists `Author` as **done**. It is done at the level the document
tracks, which is the migration. The readers were never written, and a missing
filter is indistinguishable from a filter that passes everything
([[feedback_absent_behaves_like_fine]]). This is the second half of the same gap
as [[385]]; the redirects route, scoped in the same pass, is the one that
implemented both halves and is the shape the fix copies.

## The fix

Reads are scoped and writes are stamped, so the model is implemented rather than
merely declared:

| Route                     | Now                                                       |
| ------------------------- | --------------------------------------------------------- |
| list the bylines          | this site's, plus any that write for every site           |
| fetch, rename, delete one | refuses one this site cannot see (404, never "forbidden") |
| add one                   | stamped with the site it was written on                   |
| the byline picker         | the same list, so it can only offer real choices          |

**It also needed a control, and that is not a nicety.** A byline's web address is
unique across the whole business by deliberate design (`/authors/devi-raman` is
one address), so "make a second Devi Raman for my journal" is **refused**. Scoping
the read without giving her a way to say "this name writes for all my sites"
would have produced a refusal about something the screen visibly does not
contain — and no way out of it. So the editor now carries the same two-item
choice the quick replies pane already uses for the same shape of decision:

> **Where this name appears** — You run more than one website. A name written for
> one of them stays out of the others' author lists.
> **Sites this author writes for:** _This site only_ / _All my sites_
> Choose "All my sites" when the same person writes for more than one of them.
> There is only ever one of each name, so this moves it rather than making a copy.

It renders nothing for a business with one site, matching the shared
`SiteScopeField`'s rule: there is no choice to make, and a control naming "sites"
would invent one.

**And a clash now names the site**, since it can be with a byline she cannot see:

> Dana Ruiz on Juniper Row Sample Sale already uses the web address "dana-ruiz",
> and an author's address has to be unique across your whole business. Give this
> one a different one.

The old sentence was `Slug "dana-ruiz" is already in use.` — the word "slug" to
somebody who has never seen one, on a screen that calls the field **Web address**.

The list marks a shared byline with the words a shared redirect rule already
uses — **"Shared across all your sites"** — and only when the business runs more
than one site. Three single-site businesses on this platform have a null-scoped
author each; on those, that line would be noise about a choice that does not
exist.

## Confirming it

Driven as Devi across three of her seven sites:

| Standing on             | Was | Now   | The truth |
| ----------------------- | --- | ----- | --------- |
| Juniper Row (her shop)  | 9   | **0** | 0         |
| Juniper Row Press       | 9   | **3** | 3         |
| Juniper Row Sample Sale | 9   | **6** | 6         |

Then wrote her own byline on her shop — **Devi Raman**, with a real biography —
and confirmed in the database that it belongs to Juniper Row rather than to all
seven. Then switched it to **All my sites**, confirmed the column went null, and
found her on Press reading **"Shared across all your sites"** while the three
Press bylines carry no such line.

Then opened _The case for fewer clothes_ on her shop. The **Written by** picker
now offers exactly two things: _No author_ and _Devi Raman_.

**Eight integration tests.** Proved red: with the scope predicate returning `{}`
and the write default back to null, four of the eight fail.

Then picked her own name and saved. _The case for fewer clothes_ now carries the
byline **Devi Raman** — the first post on this account signed by the person who
wrote it.

(The first attempt at that save returned a **503**. It was the dev event broker
being unreachable, not this fix and not the content route: the same save
succeeded once the broker answered again. A write that fails loudly when the
broker is down is `services/CLAUDE.md`'s deliberate design.)

## Still open

- **The five other posts still have no author.** The picker can now offer her
  name; nothing offers to apply it to work she already published, so each is a
  separate open-and-save.
- **A byline still cannot be split.** The model's whole point is that one person
  can write as two personas on two sites, but the web address is unique per
  business, so the second persona needs a different address — which nothing
  explains at the moment it is refused.
- **Nothing says what a byline is used on.** Deleting one takes her name off
  everything she has written, and the confirmation says so in words but not in
  numbers — the same shape as [[382]] and the note left open in [[385]].
