# 377 — Adding a design published somebody else's articles to her site

**Status:** fixed
**Severity:** critical
**Found by:** P03 · Juniper Row · adding a design to a site, and reading what the screen promised
**Surface:** mypiggles › My site › Ready-made sites › any design
**Filed:** 2026-09-01
**Fixed:** 2026-09-01
**Confirmed by:** installing a design, seeing nothing go public, then publishing and seeing it

## What happened

The screen says it three times, in three different places, before you commit:

> **What this adds to your site**
> Everything comes in as drafts you can change, and nothing is live until you
> publish it.

> Juniper Row Press has no pages yet, so this design gives it its first ones. They
> arrive as drafts only you can see, and nothing is live until you publish it.

> **Added as drafts on Juniper Row Press** — Everything this design adds is on your
> site as drafts. Review it, then publish it when you are ready.

Devi added Brand Newsroom to her Press site. Its nine pages arrived as drafts, as
promised. Its five example articles arrived **published**:

```
launch-notes-3-is-live            | published
introducing-nimbus                | published
the-deck-first-look               | published
five-workflows-our-team-lives-in  | published
aurora-hits-1-0                   | published
```

And the public API served all five for that site immediately.

Press had no live pages, so nothing rendered them and nothing looked wrong. **On a
site that is already live it is a different event.** A content entry is scoped to
the target site, a live journal page lists that site's published entries, and
adding a design does not unpublish the pages that are already serving. So adding a
design to a running business's site puts five made-up press releases — "Aurora
hits 1.0", "Introducing Nimbus" — onto its public journal, in its own voice, in
the time it takes the install to finish.

Her Archive site is live and its journal lists its three published entries today.
That is the same mechanism, one install away.

## Why it happened

The installer's own header states the contract:

> Everything is created as DRAFT (docs/54 D4); `goLiveInstall` publishes it on the
> tenant's explicit "go live".

Pages follow it. Products follow it — **no blueprint in the marketplace declares a
product status at all**, so they default to draft. Content did not:

```ts
status: entry.status,   // and every manifest says 'published'
```

Across all 191 blueprints: **243 content entries, every one declaring
`published`.** So the one artifact type that ignored the rule ignored it on every
design in the catalog.

The publish step already existed and was already correct — `goLiveInstall`
publishes the installed content on the owner's explicit **Publish it live**. The
install was doing that step's job, early, without being asked.

## The fix

**Content installs as a draft**, like the pages, the products and the emails
beside it. `goLiveInstall` is where a design's articles become public, and now the
only place they do.

Two smaller things fell out of it:

- **The install result carries the manifest's `declaredStatus`.** Everything is
  written as a draft, so this is the only remaining record of the difference
  between an article a design ships live and one it ships as a draft, and go-live
  is its only reader. An entry the design meant to be a draft stays one.
- **Go-live publishes only what is currently a draft.** An install that REUSED an
  entry the shop already had must not republish something they archived, and must
  not re-date a post that is already live and move it to the top of their own
  journal.

The first revision now records `draft` as well — the status actually written. A
first revision claiming `published` on a row that is a draft reads as somebody
having unpublished it.

## Confirming it

Adding Couture Serif to her Journal site, as Devi, on her real account:

| Step                           | What happened                                   |
| ------------------------------ | ----------------------------------------------- |
| Add the design                 | 3 articles created, all **draft**               |
| What the public site serves    | **0 posts** — which is what the screen promised |
| Publish it live                | the same 3 → published, each with a real date   |
| The live journal, as a visitor | three posts, each dated **1 September 2026**    |

The pages and the articles now go public in the same act, which is the only thing
an owner reading that screen could reasonably expect.

## Still open

- **"Something real on every screen" is now less true before go-live.** The
  editing canvas is unaffected — it draws placeholder records by design, not real
  ones — but a site previewed before it is published has no journal entries. The
  entry-level preview token is per-entry, so there is no way to preview a whole
  site's drafts. A site-scoped preview token would close it, and is its own work.
- **Whether the example articles should exist at all** is a separate question. They
  are somebody else's writing under a real business's name, and the screen already
  offers a **Bring its examples** switch to decline them. The switch is on by
  default.
