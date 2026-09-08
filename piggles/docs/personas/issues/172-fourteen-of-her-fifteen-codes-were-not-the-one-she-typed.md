# 172 — Fourteen of her fifteen codes were not the one she typed

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Juniper Row · act 3
**Surface:** mypiggles › Sell › Products › one product › Variants — "Give them all the same price"
**Filed:** 2026-08-23
**Fixed:** 2026-09-08
**Confirmed by:** P03 · Juniper Row · act 107

## What happened

Devi typed her own product code when she created The Ash Overshirt:
**`ASH-OVERSHIRT`**. Short, hers, the one that goes on a label.

Then she added Size and Colour, and pressed **Give them all the same price**,
which is a good control and did exactly what it promised. The fifteen codes that
came out were:

```
ASH-OVERSHIRT            ← the one she typed (XS · Clay)
THE-ASH-OVER-XS-SLATE
THE-ASH-OVER-XS-BONE
THE-ASH-OVER-S-CLAY
… eleven more, all THE-ASH-OVER-…
```

Fourteen of the fifteen are built from the product's NAME — including the "The"
she would never put on a label — and truncated to a stem she did not choose. The
fifteenth is the one she typed. One shirt, two naming schemes, and the odd one
out is the only one she wrote.

To say the obvious thing out loud, because "not hers" is easy to misread: all
fifteen belong to Juniper Row and to this product. Nothing crosses a tenant, a
shop or a product boundary. What is wrong is the STEM the software chose, not
whose records these are.

```
 sku                   | tenant_id                            | tenant
 ASH-OVERSHIRT         | 2e78fb6c-a823-4698-bcb9-58a4f17710a0 | Juniper Row
 THE-ASH-OVER-XS-SLATE | 2e78fb6c-a823-4698-bcb9-58a4f17710a0 | Juniper Row
 … thirteen more, same tenant, same product
```

## What should have happened

The generated codes extend the code that is already there: `ASH-OVERSHIRT-XS-CLAY`,
`ASH-OVERSHIRT-S-SLATE`. The product HAS a code, she chose it, and it is the
obvious stem.

## How to reproduce

Every time.

1. **Sell → Products → Add a product**. Name it `The Ash Overshirt`, and set the
   Product code by hand to `ASH-OVERSHIRT` rather than accepting the suggestion.
2. Options tab: add `Size` (XS · S · M · L · XL) and `Colour` (Clay · Slate ·
   Bone). Change how it is sold.
3. Variants tab → **Give them all the same price** → **Create them**.
4. Read the codes on the fourteen new rows.

## Why it matters

Devi prints these. They go on a swing tag, on a packing slip, into the note she
writes when a customer asks for an exchange. Fourteen codes with a stem she did
not choose and one that is different from the other fourteen is the sort of
inconsistency that makes an owner distrust her own records, and she is the most
careful owner in this roster.

It is minor rather than major because every code is unique, correct, and
editable, the dialog DID say "with a code made from its choices", and the job
finished. What it costs is fifteen edits to make her own scheme consistent —
which is the same grind the bulk control had just saved her.

There is a second, quieter half. `THE-ASH-OVER` is a truncation, so two products
whose names share the first characters — "The Linen Shirtdress" and "The Linen
Shirt", say — would generate stems that collide, and the code has to be unique.
Not seen on this run; worth knowing before somebody meets it.

## Where it lives

Not established from the screen. The generation happens server-side when the
variants are created, and the truncation length and the `THE-` prefix both come
from whatever derives a code from a title — the same function that suggests a
code on the Add a product form, which produced `THE-ASH-OVERSHIRT-1` there.

Deliberately not chased into the source: what it does is clear from the output,
and the decision below has to be made before the code matters.

One structural fact that shapes the answer, read from the database rather than
guessed: **a product has no code of its own.** `commerce_products` has a title
and no sku column; the code the Add a product form calls "Product code" is
written onto the FIRST variant, which is why `ASH-OVERSHIRT` is sitting on a row
flagged `is_default`. So "extend the product's code" really means "extend the
default variant's code", and the software has to go and read it rather than
having it to hand — which is a fair part of why it reached for the title instead.

## The fix

Made. It was not a decision to defer: the answer to "which stem" was already
sitting in the file, and the second half turned out not to be a preference at
all.

**Which stem.** The code the product already carries. Concretely that is the
default variant's — the version shown first, which is what the Add a product form
writes and what Devi typed. The bulk fill already reads that same version for the
PRICE it copies, so the generator was reading the web address while its own
caller three lines up was reading the code.

Its own choices come back off the end first. A version created BY this generator
carries its combination (`ASH-OVERSHIRT-XS-CLAY`), and anyone may make that one
the version shown first; hanging the next code off it whole would compound into
`ASH-OVERSHIRT-XS-CLAY-S-BONE`.

**The odd one out stays.** `ASH-OVERSHIRT` on XS · Clay keeps its code, and the
fourteen siblings now read `ASH-OVERSHIRT-<size>-<color>`. That is one family
with one member unsuffixed, rather than fourteen against one, and renaming a code
that may already be printed on a swing tag is not a thing to do quietly. The
original argument for leaving it stands; what changed is that leaving it is no
longer conspicuous.

**The quiet half was not hypothetical, and it was the more serious one.** The
12-character truncation was applied to the STEM, which is the only part that
makes a code unique across products. Asking the database how many products share
a truncated stem inside one tenant:

```
     tenant      |     stem     | products
-----------------+--------------+----------
 Threadline      | SAMPLE-BRUSH |       12
 Threadline      | SAMPLE-LINEN |       12
 Threadline      | SAMPLE-SLUB- |       12
 … four more twelves, then a long tail of twos and threes
```

Twelve products, one stem, the same size and color axes. The second one filled
in asks the server for a code the first already holds, the server refuses it, and
the bulk fill stops partway with "Created 3, then stopped" and no way out — there
is no bulk rename. So the stem is no longer shortened at all; only the choice
tokens are, where a long color name is the only thing at risk.

**A new test caught the fix leaving its own neighbour behind.** `skuStem` falls
back to the product's web address when there is no version yet, and that fallback
was still slicing to twelve — one line below the truncation I had just argued
against. The test naming two products called "The Linen Shirtdress" and "The
Linen Shirt" went red on my own code.

Both consoles. The sparx twin's copy lived inside a 1,200-line `.tsx`, where the
console's test seat (pure functions, no React) could not reach it, so the slot
rules moved to `product-variant-slots.ts` beside a test file that mirrors the
Piggles one.

Guards run red both ways, and they are independent: dropping the stem fix reddens
the two stem tests and leaves the truncation pair green; restoring the truncation
reddens the truncation pair and leaves the stem tests green.

### Where the code changed

- `piggles/apps/workbench/surfaces/commerce/product-variants/slots.ts` —
  `normalize`, `token`, new `skuStem`, `suggestSlotSku(stem, …)`
- `…/product-variants/use-variants-tab.ts` — derives `stem` and `taken` ONCE and
  hands them down; three places offer a code and a stem derived three times is a
  stem that drifts
- `…/product-variants/{variant-actions.ts, slot-rows.tsx, grouped-grid.tsx,
no-price-yet.tsx}` and `product-variants.tsx` — the call sites
- `sparx/apps/workbench/surfaces/commerce/product-variant-slots.ts` (new, split
  out of `product-variants.tsx`) + `product-variant-slots.test.ts`
- `piggles/…/product-variants/slots.test.ts` (new, 6 tests)

## Confirmed by

P03 · Juniper Row · act 107, on her screen with her data.

Devi added **Moss** (`#6E7B4F`) as a fourth colorway to The Ash Overshirt for the
autumn drop — Options → Add a color → Change how it is sold — which left five
combinations without a price. The single **Set a price** on XS · Moss pre-filled
`ASH-OVERSHIRT-XS-MOSS`. **Give them all the same price** → **Create them** wrote
all five:

```
 ASH-OVERSHIRT-L-MOSS
 ASH-OVERSHIRT-M-MOSS
 ASH-OVERSHIRT-S-MOSS
 ASH-OVERSHIRT-XL-MOSS
 ASH-OVERSHIRT-XS-MOSS
```

Read off the Product code field on the Variants tab, then confirmed in the
database. Her scheme, extended.

## Rating effect

`Sell › Product › Variants` — recorded in [rating.md](../rating.md).
