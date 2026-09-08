# 409 — The tab she picked went dark and the one she did not stayed bright

**Status:** fixed — both halves. See "The keyboard half, re-measured" at the end.
**Severity:** major
**Found by:** P03 · Juniper Row · act 83 · reading her first customer review
**Surface:** mypiggles › every pane with a pill tab strip — 6 files here, 6 in the other console
**Filed:** 2026-09-05
**Fixed:** 2026-09-05
**Confirmed by:** re-opened the pane as Devi in both themes; the selected pill is filled and readable

## What happened

A customer left a four-star review of The Ash Overshirt. Devi opened
**Reviews & questions** to read it, and the tab strip looked like this:

    Reviews (1)          Questions
    ^ nearly invisible   ^ bright white

**"Reviews (1)" was the tab she was on.** The review was underneath it. But the
selected tab had no fill and its words were painted in a near-black ink on the
dark pane, so the only readable label on the strip was the one she was NOT
looking at. Clicking Questions swapped which label vanished.

Measured in the running page rather than judged from a screenshot:

    selected   "Reviews (1)"   color: rgb(32, 38, 49)    background: transparent
    unselected "Questions"     color: rgb(244, 245, 247) background: transparent
    <span class="tabs-indicator" hidden>   ← the pill, never drawn

## What should have happened

The tab you are on is the filled one. That is the whole job of a pill strip, and
DESIGN.md RULE #4 states it directly: selection is a filled shape.

## Why it matters

It is not only ugly. The dark ink is **correct ink for a light pill** — silica
resolves the selected tab's foreground on the assumption that the pill is behind
it. With the pill missing, the ink is the failure: the label she needs is the one
she cannot read, and the strip actively tells her she is somewhere she is not.

And it is not one pane. The same shape is written in **six panes in this console
and six in the other** — reviews, translations, the configurator, product tabs,
languages, and the customer record.

## Where it lives

`components/scroll-strip.tsx`, and its own header says so:

> THIS IS A STOPGAP. SILICAUI ALREADY HAS IT, AND WE CANNOT INSTALL IT YET.
> `TabsList` upstream takes `scrollable` (default true) … absent from the 0.51.0
> this repo installs. When it ships, DELETE this file.

**It shipped.** The workspace catalogue is on **0.55.0**, and the installed
`TabsList` already renders its own scroll strip — the live markup shows silica's
own `scroll-strip tabs-scroller` wrapping the list. So the stopgap now puts a
SECOND scroller between `<Tabs>` and `<TabsList>`, and the moving indicator,
which measures the active tab against the list's own box, never resolves a
position and stays `hidden` forever.

The header predicted this exact failure two paragraphs later, about a different
wrapper: "makes the selected pill's fill vanish entirely, so the current tab
stops being marked at all."

## Not every strip, which is what hid it

The product's own strip (Overview / Options / Variants / …) draws its pill
correctly through the same wrapper. The ones that break are the strips whose
labels CHANGE after the pane has mounted — a count arriving (`Reviews` →
`Reviews (1)`), a locale loading. The first render measures; the re-measure after
the text grows never lands through the extra scroller. That is why the pane
looked right when Devi had no reviews and broke the moment she had one.

## What the cause actually turned out to be

The first read blamed the local `ScrollStrip` for putting a second scroller
between `<Tabs>` and `<TabsList>`. **That was wrong, and removing it did not fix
anything** — the strip stayed dark. Recorded rather than tidied away, because the
wrong diagnosis is the reason the next paragraph took as long as it did.

The real cause is one step further down, and it is bigger than the pill:

    Overview:ti0 | Options:ti-1 | Variants:ti-1 | …     ← a pane opened on page load
    Reviews (1):ti-1 | Questions:ti-1                   ← the same pane opened mid-session

**Every tab lands on `tabindex="-1"`.** Nothing is reachable by Tab, arrow keys
move nothing, and Base UI's own registry is therefore empty — so
`getTabElementBySelectedValue()` returns nothing, the indicator can never find a
tab to measure, and it stays `hidden` for the life of the pane. It never
recovers: not on a tab click, not on a window resize.

The pattern is **panes opened during a session break; panes present at page load
work.** That is why it looked intermittent and why the product's own tab strip
seemed fine.

## What was fixed, and what was not

**Fixed — the selected tab marks itself.** Silica splits "selected" across two
elements: the ink flips on the tab from `[data-active]`, which is always set,
while the fill lives on a separate `.tabs-indicator` that can vanish. So the half
that survives is the wrong one, and on `pills` the surviving half is ink chosen
for a filled accent pill. A rule at the end of each console's `globals.css` paints
on the tab exactly what the indicator would have painted, and **only while it is
hidden** — `:has(> .tabs-indicator[hidden])`. When Base UI measures normally the
selector does not match and the slide animation is untouched.

All three variants are covered, each reproducing its own mark: `pills` the accent
fill, `boxed` the raised base-100 pill, the default an inset 2px underline.

**NOT fixed at the time this was written — the keyboard.** Roving focus was dead
on those strips, and that is the more serious half: one of this project's standing
checks is a full job driven by keyboard alone, and a tab strip nobody can Tab into
fails it. **This turned out to be fixed by the `ScrollStrip` deletion recorded at
the foot of this file, and was never re-measured after it — see the last section.**

**NOT checked — whether production shares it.** The dev server runs with React
StrictMode on, which double-mounts every component, and that is a plausible
ingredient in a registration race. A production build was not built or measured,
so this is unknown rather than fine.

## Confirmed by

Driven as Devi, on the pane that found it:

> Opened **Reviews & questions** on The Ash Overshirt mid-session — the state
> that reproduces it. The indicator is still hidden (`indHidden: true`), and the
> selected tab now measures `background: rgb(221, 169, 139)` with its dark ink:
> a filled peach pill reading **Reviews (1)**, with **Questions** plain beside
> it. Checked again in light mode, where it reads the same way.
>
> On a strip where Base UI measures normally, the selected tab's own background
> is still `rgba(0,0,0,0)` — the fallback correctly does nothing.

The redundant `ScrollStrip` was deleted anyway, since silica 0.55.0 ships
`<TabsList scrollable>` and the file's own header said to. Twelve call sites in
two consoles collapsed to the upstream prop; the two component files are gone.

## The keyboard half, re-measured (2026-09-05, act 87)

The paragraph above says roving focus is dead and needs the upstream integration
looked at. **It is not dead. It was measured BEFORE the redundant `ScrollStrip`
was deleted, and never measured again after** — the deletion is recorded three
paragraphs down as an afterthought ("deleted anyway, since silica 0.55.0 ships
`<TabsList scrollable>`"), and it was in fact the fix.

Driven as Devi, by keyboard alone, on two strips opened MID-SESSION — the state
that reproduced the failure:

**Reviews & questions** (the pane that found the bug, and one whose labels change
after mount as the counts arrive). Clicked **Reviews (1)**, pressed **→**: focus
moved to **Questions (1)**. Pressed **Enter**: the panel switched, Tomas's
question and her answer appeared, and the fill moved with it.

**A product** (Overview / Options / Variants / Media / Details / Pricing / SEO).
Clicked **Overview**, pressed **→** three times, pressed **Enter**: the Media
panel opened with her photograph in it.

Measured on that strip afterwards:

    Overview:ti-1 | Options:ti-1 | Variants:ti-1 | Media:ti0* |
    Details:ti-1 | Pricing:ti-1 | SEO:ti-1
    indicator hidden: false   indicator width: 69px
    selected tab background: rgba(0, 0, 0, 0)

**Exactly one tab at `tabindex="0"`, and it is the selected one.** That is what
roving focus looks like — the earlier reading, "every tab lands on
`tabindex="-1"`", was describing a registry that never populated, and it does now.
The indicator measures and draws on its own, and the CSS fallback correctly paints
nothing (the selected tab's own background is transparent).

**The fallback stays.** It is now belt-and-braces rather than the thing holding the
mark up, and one session's evidence is not enough to delete a guard against a
failure that was intermittent by nature. Its selector only matches while the
indicator is `hidden`, so it costs nothing when Base UI is working.

**Still NOT checked — whether production shares any of this.** The dev server runs
with React StrictMode on, which double-mounts every component and was a plausible
ingredient in the original registration race. A production build has still not
been built or measured, so that remains unknown rather than fine.

## RULE #7 — a shared surface was swept, so an earlier job was re-driven

Twelve panes across both consoles had their tab strips rewritten. Priya
Nandakumar's customer record — one of the twelve — was reopened afterwards and a
real job done on it: a note logged about her wholesale enquiry for six Ash
Overshirts. The strip drew **Overview** as a filled pill with silica's own scroll
chevrons at each end, switching to **Notes** moved the fill, and the note saved
to a green **Note saved** toast and appeared on the timeline.
