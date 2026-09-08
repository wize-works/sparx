# 418 — The screen told her the hold-up was her account

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 85 · scoring What people searched for
**Surface:** mypiggles › Get Found › **What people searched for**, and twice more on **How people find you**
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Devi opened **What people searched for** and read:

> **Not available yet**
> This connection is not switched on **for your account** yet. Once it is, you
> will be able to link Google here and see your real search numbers on the Search
> performance screen.

Nothing else on the screen. No button, no link, no next step.

The same sentence appears twice more on **How people find you**, under two
sections she will read long before she finds this one:

> Real search numbers from Google will appear here once this connection is
> switched on **for your account**.

Each of those carries an **About Search Console** button, and that button leads to
the first screen — which says the same thing. Three statements and one loop.

## Why it is wrong, not just unhelpful

Whether this connection works is decided by two environment variables and an
encryption key on the server:

```ts
export function isSearchConsoleConfigured(): boolean {
  return Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && isTokenCryptoConfigured()
  );
}
```

It is one answer for every tenant on the platform at once. Her account is not
consulted. Neither is her plan, her modules, her settings, her site, or anything
she has ever touched.

So the sentence does not merely fail to help — **it names the wrong thing and
sends her to work on it.** A business owner reading "not switched on for your
account" will go and look at her account: settings first, then her plan, then
billing, then support, asking to have a thing switched on that nobody can switch
on for her. Every one of those is a wasted trip, and the last one costs someone
else's time too.

It also quietly implies she is on the wrong plan, on a screen that appears one day
before her trial ends and next to a banner asking her to set up payment. That is
the worst possible place to hint that a feature is being withheld from her.

## What was right about it already

Worth saying, because the neighbouring screen gets the hard part right. **How
people find you** shows an em-dash for "Visits from search" and for "Average
position", each labelled _connect Google to see_, rather than a zero. It never
dresses an absence up as a measurement. The problem here was never invented data;
it was one wrong noun repeated three times.

## The fix

**Say whose side it is on, say there is nothing to do, and hand her the screen
that works.**

`piggles/apps/workbench/surfaces/seo/search-console.tsx` and its sparx twin:

> **Not ready here yet**
> This one is on our side, not yours. Nothing in your account, your plan or your
> settings is holding it up, and there is nothing for you to switch on or ask for.
> When it is ready, you will be able to link Google from this screen.

And under it, a card that is not a dead end:

> **What you can see today**
> Google's own figures are the only part missing. Everything measured here — how
> each page scores, and what is worth fixing — is on **How people find you**, and
> it is up to date.
>
> [ Open How people find you ]

`performance.tsx` in both consoles loses the same noun:

> Google's own search numbers are not ready on this side yet. It is nothing to do
> with your account or your plan, and there is nothing for you to switch on.
> Everything measured here — how each page scores, and what is worth fixing — is
> up to date.

**The other screen is named from the registry, never typed.** The button and the
sentence both read `surfaceTitle('seo.performance')`, so they say "How people find
you" in piggles and "Search performance" in sparx, and neither goes stale if the
name changes. `surfaceTitle` already existed in piggles; sparx gained the same
short helper so the two files stay identical.

No brand name is hard-coded in the copy either — the file is duplicated across two
consoles with two different names on the door, so "Piggles" in it would be wrong
in one of them by construction.

## Proved, on the screen that produced it

Reloaded **What people searched for**: the alert reads "Not ready here yet" with
the new sentence, and a **What you can see today** card sits under it. Clicked
**Open How people find you** — the pane opened, showing Average score 76 across 43
pages checked, 14 pages to improve, and 5 / 14 / 5 across What to work on. Both
"Coming soon" cards on that screen now carry the corrected sentence.

Checked in dark and in light, and at 360px in an injected iframe: no horizontal
overflow (`scrollWidth` equals the viewport), both cards readable, the button
reachable.

## Rating effect

Feeds `seo.search-console` and `seo.performance` — see [rating.md](../rating.md).
