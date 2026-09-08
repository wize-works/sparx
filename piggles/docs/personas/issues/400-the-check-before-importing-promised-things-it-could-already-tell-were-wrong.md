# 400 — "Check before importing" promised things it could already tell were wrong

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 80 · pasting a real site-rebuild list
**Surface:** mypiggles › Content › Old links › Bulk import
**Filed:** 2026-09-05
**Fixed:** 2026-09-05
**Confirmed by:** driven at desktop and at 360px; every line now says what will actually happen to it

## What happened

Three things, all in the one section whose entire job is to tell her what will
happen before she commits.

**It called a doomed line "Ready".** `/sale, /collections/winter` got a green
Ready badge and was counted in "Import 5", when `/sale` already had a rule. The
app knew: those rules are the list on the screen behind this one. She pressed a
button that promised five and got a refusal ([399] made that refusal fatal; even
fixed, being told "Ready" about something that will be turned down is a false
promise).

**It refused her own web addresses.** Every crawler and search-console export
gives FULL addresses, and this pane's own first sentence is "after a site
rebuild, say" — which is exactly when you have one. Pasting
`https://juniper-row.piggles.site/lookbook-2025` was answered with:

> Both addresses must be a path on your site, starting with a slash.

Her address, on her site, called not a path on her site. The remedy was to go and
hand-edit a spreadsheet.

**On a phone she could not see any of it.** The preview was a four-column table
in a fixed-height box. Measured at 360px: the table needs **617px**, the box gets
**290px**, so Type and Status were both off the right-hand side. She saw four
addresses and nothing about which one was wrong — the one thing the section
exists for. The box also had its own scrollbar inside a pane that already
scrolls, and its column headers slid out of sight behind its own top edge.

## What should have happened

The section is called "Check before importing". A check that says "Ready" about a
line it can already tell will be refused is not a check, and one whose answers
are off-screen on a phone is not one either.

## How to reproduce

Every time, before the fix:

1. Content › Old links › Bulk import.
2. Paste a full web address on your own domain, and a line whose old address
   already has a rule.
3. The full address is refused; the existing one says Ready.
4. In a 360px iframe, the Type and Status columns are off-screen.

## The fix

**A full address is read as the path when the address is one of hers.** Her
connected domains come from the same `['domains']` query the Site addresses
screen uses. Scheme optional, because a spreadsheet often holds a bare
`example.com/page`; the query is kept, because `/p?id=12` is a different address.

Only her own, and that is not a hedge: a redirect fires on the addresses her site
answers on and nowhere else, so a rule written for a domain she has not connected
could never run. Anything else is refused with a sentence that names it —
_"juniperrow.com is not one of your web addresses. Paste just the part after it,
like /about-us."_ — instead of the old line, which did not mention that her
address was the problem.

**A line that already has a rule says so, and says where it goes.** Not red:
nothing is wrong with it, it just will not be imported, so it wears
`Already set up` in info and reads _"Already moved — it goes to
/collections/autumn. Change it on the Old links screen."_ Marking it as her
mistake would send her hunting for one. Three states now, not two, and the
summary counts all three: _"4 will be added, 1 is already set up and will be left
alone, 1 needs a fix first."_

**The table is not a table any more.** A check list is not a data grid. Each line
stacks on a phone and lays out in a row from `sm:` up, so every part is on screen
at every width — no sideways swipe, no second scrollbar, no headers to lose.

Also here, because the file was open: `color="neutral"` on **Import another list**
was chosen without Brandon's approval (root RULE #4) and is now a colorless
outline button, which is what a genuinely untyped action wears.

`redirects-import.tsx` was 331 lines. Under Piggles RULE #0.5 it is now three
files (187 / 129 / 93) plus the parse, which moved out of `redirects-format.ts`
into `redirects-parse.ts` once it learned two facts about the business.

## Confirmed by

Driven as Devi at both widths.

> **Desktop.** Four lines pasted: her own full address, another company's, an
> existing rule, and a new temporary one. Toolbar: **"1 ready · 2 already set up
> · 1 to fix"**. `https://juniper-row.piggles.site/lookbook-2025` read as
> `/lookbook-2025`; `juniperrow.com` named in its own refusal; `/sale` showing
> where it currently goes; `/new-arrivals` Temporary and Ready. Imported: **"1
> redirect imported"**, and the rule landed as a 302.
>
> **360px, in an injected iframe.** Every line complete — number, both addresses,
> Permanent badge, state badge, and the full reason underneath. Measured:
> `pageScrollsSideways: false`, and no box scrolls sideways except two `truncate`
> spans in the dock chrome, which is what truncation is.

## Still open

- **The existing-rules check reads one page of 250.** It is advisory; the server
  is the authority and now skips a colliding row on its own with a sentence
  naming where the rule points ([399]). A business past 250 rules gets the
  server's answer rather than a wrong one, which is the right way round.
- **The Add-a-redirect dialog still refuses a full address**, since it takes one
  typed field rather than a paste. Same fix would suit it.
- **Every other table in this console still side-scrolls on a phone.** Here it
  was fatal because Status IS the content; on a list where the first column is
  the identity it is merely awkward. A shared responsive answer in
  `components/table.tsx` is the propagating fix and is a design decision, not one
  to make inside a preview component.

## Rating effect

`cms.redirects.import` scored for the first time — see `rating.md`.
