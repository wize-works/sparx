# 393 — The page holding her form was invisible to the screen warning her about deleting it

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · saving her contact form as a reusable piece
**Surface:** mypiggles › My Site › Saved pieces › Send me a message
**Filed:** 2026-09-02
**Fixed:** 2026-09-02
**Confirmed by:** the pane now names Contact, and a real delete was driven through to the detached page

## What happened

Devi opened her Contact page, selected the section holding her enquiry form, and
saved it as a piece called **"Send me a message"** so she could put it on her
About page too. Then she opened it from Saved pieces and read:

> **Not used yet**
> This piece is saved but not on any page yet.
>
> **Where it's used** — This piece isn't on any page or layout yet. Add it to a
> page in the editor and it will appear here.
>
> **Delete this piece** — Removes it and its history for good. This cannot be undone.

It was on her Contact page. That is where it came from, and the instance was
still sitting there, saved. Every sentence on the screen said otherwise.

Pressing Delete offered a confirm that made the claim explicitly:

> "It is **not on any of your pages**, so **nothing your visitors see will
> change**."

Both halves were false, on the one dialog whose whole job is telling her what she
is about to do.

## Why it happened

There are two placement systems, and the where-used scan only ever knew one.

| Placement | Written as                             | Stored in                                     | Scanned? |
| --------- | -------------------------------------- | --------------------------------------------- | -------- |
| Legacy    | `custom:<key>` in a `BuilderNode` tree | `draft_tree` / `published_tree`               | yes      |
| Silica    | `instanceOf: tenant:<key>`             | `silica_draft_tree` / `silica_published_tree` | **no**   |

`scanUsages` read the two legacy columns for the legacy shape. Every piece the
surviving editor creates is the second kind, so **every piece a Piggles owner has
ever saved reports "not used yet" forever**, however many pages carry it.

The tell is that the predicate already existed. `placesInstance(tree, symbolId)`
sits in `detach-instances.ts`, exported, in the same folder, written for the
delete path — and nothing in the usage scan called it. The delete path had
already been taught about silica placements; the READ beside it never was, and
the file even says so in a comment: _"`scanUsages` never looked at the silica
trees at all"_. That sentence was written while fixing the data half and left
standing over the display half.

## The fix

**The scan sees both systems now.** A page or layout appears if either kind of
tree holds the piece, in draft or published.

**And it answers two questions instead of one.** Being used and being blocked are
not the same fact:

- A **legacy** reference is resolved at draw time and cannot be inlined, so it
  genuinely refuses a delete.
- A **silica** instance DETACHES — the page keeps the design exactly as it looks
  and simply stops following the master.

So `ComponentUsageDto` gained `blocking` alongside `total`. Counting them as one
number would have been the same bug in the other direction: with the scan fixed,
a guard on `total` would have refused every delete of a placed piece, and the
detach that exists to serve exactly that case would have become unreachable code.
The server blocks on `blocking`; the console disables Delete on `blocking` and
describes reach with `total`.

**The confirm now says what will actually happen**, and it is a different
sentence in each case:

> This removes the piece and its whole history for good. The page it is on will
> keep the design exactly as it looks now and simply stop following it, so
> nothing your visitors see will change. You will not be able to change it from
> one place any more. This cannot be undone.

That last clause is the real loss, and nothing had ever named it.

**One more thing repaired in the same path.** Detaching merged the instance's
classes with the master's by joining them, and save-as-piece leaves the instance
wearing the very classes it just handed over — so a detached section came back as
`bg-base-100 @container px-6 py-16 text-center bg-base-100 @container px-6 py-16
text-center`. Seen in her own page after the delete. Each class is written once
now, and every save-and-delete round no longer doubles it again.

## Confirming it

Driven as Devi on the real piece:

|                 | Before                                 | After                                                           |
| --------------- | -------------------------------------- | --------------------------------------------------------------- |
| Badge           | Not used yet                           | **On 1 page**                                                   |
| Where it's used | "isn't on any page or layout yet"      | **Contact · Page**                                              |
| Delete panel    | "Removes it and its history for good." | "The page it is on will keep the design and stop following it." |

Then a real delete was driven end to end on a second piece ("Come and say
hello", also on Contact): the confirm carried the new sentence, the delete was
allowed, the toast fired, and the Contact page in the database came back with the
whole section inlined — heading, paragraph and the "Email me directly" button,
each with fresh ids and each class written once. Nothing was lost.

**Tests.** The class-dedupe case was added to `detach-instances.test.ts` and
proved red against the old join.

## Still open

- **No integration test on the scan itself.** The two placement systems and the
  blocking split are covered by the console and the server reading the same
  numbers, not by a test that seeds a silica placement and asserts the DTO. Worth
  adding; the fixture needs both tree shapes on one page.
- **Legacy placements are untestable here.** No Piggles tenant has one — the
  console has only ever written silica trees — so the `blocking > 0` branch is
  reasoned about rather than driven. It is the branch that was there before.
- **"Where it's used" does not say draft or published.** A piece placed only in
  an unpublished draft reads identically to one on the live site, and those are
  different risks when deciding to delete.
