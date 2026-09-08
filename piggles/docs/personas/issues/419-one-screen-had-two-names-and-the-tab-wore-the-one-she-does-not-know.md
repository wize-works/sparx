# 419 — One screen had two names, and the tab wore the one she does not know

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Juniper Row · act 85 · opening What people searched for
**Surface:** mypiggles › Get Found › **What people searched for** — its pane tab
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Devi searched for the screen and picked the row she was offered:

    Get Found
      What people searched for

The nav panel calls it that too, highlighted, with a dot beside it. The tab that
opened said:

    Search Console

Two names for one screen, on screen at the same time, and the tab wore the one a
clothes maker in Denver has no reason to know.

## Why the console has two names for it in the first place

Deliberately, and the reasoning is written down in `vocabulary.ts`:

> The platform names this after Google's product. A person who has one knows what
> it is; a person who does not reads a proper noun and learns nothing — and the
> screen's job is a sentence either of them understands. The connect button inside
> it still says Google Search Console, which is where the proper noun belongs.

So the rename is correct and considered. The bug is that it did not reach the tab.

## The cause

The registry is the single place a screen is named, and `resolveTitle` applies the
brand's word there. Its own comment says so:

> The single chokepoint every consumer already went through — the nav panel, the
> launcher, the command palette, a pane's tab, the status bar, the feedback
> composer's context — which is why the brand's vocabulary is applied HERE and
> nowhere else. One lookup renames a screen in all seven places at once, and there
> is no seventh place for one of them to be missed.

The chokepoint held. The pane walked around it:

```ts
useEffect(() => {
  ctx.setTitle('Search Console');
}, [ctx]);
```

`setTitle` exists for a pane that names itself after a **record** — "Order #1043",
a customer's own product name — which is the tenant's data and not the platform's
vocabulary. This pane used it to re-assert its own static title, in the platform's
words, on every mount. `titleFor` prefers an operator-set title, so the hard-coded
string won every time.

It is the exact failure the comment predicted, arriving from a direction the
comment did not cover: not a seventh consumer that forgot to ask, but a pane that
answered over the top of the six that did.

## The fix

Delete the effect, in both consoles. The registry already says `title: 'Search
Console'`, so sparx renders identically and piggles gets the rename it was
supposed to have.

Removing it in sparx too is the point rather than tidiness: the same override
would swallow any rename sparx ever makes, and leaving one copy in place leaves
the trap armed.

## Proved, on the same screen

Closed the stale tab (a tab keeps the title it was created with), reopened the
screen from the search box, and the tab reads **What people searched for** — the
same words as the nav row and the launcher row that opened it. At 360px the mobile
title bar reads it too.

## Rating effect

Feeds `seo.search-console` — see [rating.md](../rating.md).
