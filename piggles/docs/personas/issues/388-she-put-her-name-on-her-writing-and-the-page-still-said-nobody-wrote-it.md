# 388 — She put her name on her writing and the page still said nobody wrote it

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · finishing [[387]] — picking her own byline, then reading her own post
**Surface:** the tenant's website › any blog post
**Filed:** 2026-09-02
**Fixed:** 2026-09-02
**Confirmed by:** her live post now reading "August 28, 2026 · Devi Raman"

## What happened

Fixing [[387]] gave Devi her own byline and a picker that finally offered it. She
chose **Devi Raman** on _The case for fewer clothes_, saved, and the console said
Saved. Then she opened the post the way a customer would.

Her name was not on it. Not below the headline, not above it, not anywhere:

```
$ curl .../blog/the-case-for-fewer-clothes | grep -c "Devi Raman"
0
```

190 KB of rendered page, and the name she had just put on her own work appeared
**zero times**.

## Why it happened

Not a broken binding — a binding nobody ever wrote. The value was already in the
component's hand at every step:

| Step                  | Carries the author?                                         |
| --------------------- | ----------------------------------------------------------- |
| `content_entries`     | yes — `author_id`, and the console writes it                |
| the public read       | yes — measured: `author: { display_name: "Devi Raman", … }` |
| the site's fetch      | yes — `ApiEntryAuthor`, typed, on the entry                 |
| `postToBuilderRecord` | yes — `projectByline` puts `authorName` in the record scope |
| the route             | yes — passes that scope straight to the resolver            |
| **the post template** | **no. The masthead binds `date`, `title`, `excerpt`.**      |

The sibling proves the machinery was fine: `date` binds one line above and
renders **August 28, 2026** on the very page missing the name.

**And the file had already written down the fix it never applied.** `cms.ts`'s
own header:

> The default templates below don't bind them yet (an empty bind would blank an
> authored line); a template that wants a byline gates it with
> `visibleWhen('authorName')`.

A deferral that names its own remedy in the same sentence, and then outlived it —
while the CMS grew an author picker on every post, a whole Authors module behind
it, a `property_id` column, and a public read that `include`s the relation. Six
pieces of a seven-piece feature.

This is [[feedback_fetched_but_never_rendered]] at its purest: not a value that
failed to load, a value that arrived and nothing drew.

## The fix

The byline the header promised, in the masthead beside the date, gated:

```ts
visibleWhen(
  el('span', 'flex items-center gap-2', {
    children: [
      el('span', undefined, { text: '·' }),
      bind(el('span', undefined, { text: 'Author name' }), 'authorName'),
    ],
  }),
  'authorName'
);
```

Three decisions in that shape, each answering the reason it was deferred:

- **Gated, not bound bare.** An empty bind REPLACES the authored text, so an
  authorless post would print the placeholder. `visibleWhen` drops the node
  instead — and _ghosts_ it on the editing walk, so a template author can still
  select and style a byline on a post that has none.
- **The separator lives INSIDE the gate.** Outside it, a post with no author
  renders `August 28, 2026 ·` trailing into nothing.
- **Only the NAME.** `authorAvatar` and `authorBio` are projected too and stay
  unbound on purpose: a photo-and-bio card is a different block with its own
  placement (the catalog already ships `author_bio`), not a line in a masthead.

Date and byline share one line because they are the same kind of thing — two
facts about the post. Neither is an eyebrow, which the file already argues for
the date.

## Confirming it

Her real post, on her real site, as a reader:

> **August 28, 2026 · Devi Raman**
>
> # The case for fewer clothes

And the half that gets forgotten — _How to read a fabric_, which still has no
author — renders `August 28, 2026` and nothing else. No placeholder, no orphaned
separator.

**Two new tests** (5 in that file, 1352 in the package). The authorless one had
to be corrected before it was right: it first asserted against an ABSENT
`authorName`, which is unknown-ref territory and correctly keeps the placeholder.
The storefront always sends the key (`author?.display_name ?? ''`), so the honest
fixture is `authorName: ''`. The distinction is the contract, and the test now
says so.

**Cross-persona (RULE #7):** the change is in a shared surface, so the earlier
businesses were checked. Aster Bloom, Bella Salon, Atlas Supply and Demo Apparel
all serve the platform's suspend overlay, which returns from `layout.tsx` before
any template is read — their trials expired (2026-07-20, 07-28, 08-20) while
Juniper Row's runs to 09-06. Unrelated to this fix and correct behavior, but it
means the neighbour check ran against the test suite and the one live tenant, not
against a second live site. Recorded rather than glossed (RULE #4).

## Still open

- **Only Juniper Row gets it today.** These templates are seeded per site and a
  stored tree freezes at publish. All four of her `cms.blog_post` pages are
  unpublished, so the code factory serves them and the fix lands — but a tenant
  who has published their own post template keeps the byline-less version until
  `upgradePageBody` heals it forward, and nothing schedules that.
- **`authorAvatar`, `authorBio`, `category` and `tags` are still projected and
  still undrawn.** Same shape as this defect, one step smaller: the data is in
  scope and no default template binds it. The `author_bio` catalog block exists
  for the first two; nothing surfaces the tags.
- **The blog INDEX cards have no byline either.** `post_grid` binds cover, title
  and excerpt. On a multi-author publication that is the list where a byline does
  the most work.
- **Nothing tells her the byline is showing.** She picked a name in the console
  and had to open the public page to find out whether it took.
