# 413 — Two rows in her Layers list were written in code

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Juniper Row · act 83 · adding the questions block to her product page
**Surface:** mypiggles › My Site › Page › Each product — the Layers rail, and the Inspector's identity header
**Filed:** 2026-09-05
**Fixed:** 2026-09-05

## What happened

Devi placed the Questions block on her product page and scrolled the **Layers**
list to check where it landed. Every row in that list is written for her:

    Product name
    $0.00
    Sold out
    Shipping & delivery
    Returns & refunds
    Featured

and then the last two rows read

    commerce.product-revi…
    commerce.product-que…

The Inspector's identity header, top-right, said the same thing truncated to

    commerce….

Both are the raw allowlist key the platform matches internally. Nothing else on
the screen is written that way.

## What should have happened

**Reviews and ratings** and **Questions and answers** — the exact words the Insert
palette used ninety seconds earlier when she picked the block, and the words the
registry already holds for both.

## Why it matters

Small, and worth fixing anyway for two reasons.

It is the **only** thing on that rail she cannot read, so it reads as something
that leaked rather than as a name. The rows on either side of it are in her
language, which makes the two that are not look like an error she caused.

And it is the row she needs when she wants to move the block, restyle it, or take
it off. A live region is not visible on the canvas as a normal element — the
Layers rail is how you get hold of one — so the row is the handle, and the handle
was labelled in a language she does not read.

## The cause

`rowLabel` in `wizeworks/packages/studio/src/react/navigator/layer-tree.ts` ended
with a bare fallback:

```ts
if (node.kind === 'host') return node.component;
```

The name it should have shown was in `HOST_COMPONENTS` the whole time — the same
`label` the palette row, its search index and its tooltip all read. Nothing
connected the two.

Worth noting **why this bit one console and not the other**: sparx offers its host
cores through the builder's own `hostComponents()`, which stamps the registry
label onto a node on insert. Piggles offers them through the palette catalog
(`hostCoreGroups`), whose `make: () => hostCore(key)` emits a bare node with no
label. Same registry, two doors, and only one of them carried the name through.

## The fix

`rowLabel` now looks the name up:

```ts
if (node.kind === 'host') return HOST_LABELS[node.component] ?? node.component;
```

**Looked up rather than stamped**, which matters and is the reason this was not
fixed in `hostCore()` instead. A host core exists so the platform can keep
improving what renders there for every tenant with no migration; the name is part
of what renders. A label stamped at insert freezes, so renaming "Reviews and
ratings" in the registry would reach only sites built after the change — the exact
failure host cores exist to avoid.

Three things fall out of it for free:

- **Both consoles**, because `@wizeworks/studio` is the shared studio. Piggles was
  the one showing keys; sparx gets the same lookup as a floor under its stamp.
- **Every already-stored tree**, with no migration and no repair pass. Devi's
  reviews block was placed weeks ago and reads correctly now.
- **The Inspector header**, which calls the same function. One fix, both places.

A name **the author types still wins** — `rowLabel` checks `node.label` first — so
renaming the block "Ask the maker" does what it always did. And an **unregistered
key still shows as itself**: that is a half-built core, and calling it "Live
region" would make it indistinguishable from a working one.

Four tests in `layer-tree.test.ts` cover the registry name, the author's rename,
and the unregistered fallback.

## Proved, on the same screen

Reloaded the studio on **Each product** and scrolled the Layers rail:

    …
    Sold out
    Reviews and ratings
    Questions and answers

Selected the questions row; the Inspector header reads **Questions a…** rather
than **commerce….**

## Rating effect

Feeds `builder.page` — see [rating.md](../rating.md).
