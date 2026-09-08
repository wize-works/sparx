# 447 — Escape threw away the color she typed

**Status:** fixed
**Severity:** moderate
**Found by:** P03 · Juniper Row · act 107, filed and fixed in act 108
**Surface:** Sell › a product › Options › a color swatch
**Filed:** 2026-09-08
**Fixed:** 2026-09-08
**Confirmed by:** P03 · Juniper Row · act 108

## What happened

Devi adds a colorway. She presses the swatch, types the hex from her own brand
sheet into the **HEX** box, and presses **Escape** because she is finished.

The panel closes. The color is gone. The chip still shows what it showed before,
and nothing says anything.

Enter keeps it. Clicking anywhere else keeps it. Only Escape throws it away.

## What was actually happening

`@wizeworks/silicaui-react` 0.55.0, `ColorPicker`:

```js
onChange: (e) => setHexDraft(e.target.value),
onBlur: commitHex,
onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); commitHex(); } }
```

The HEX box keeps a DRAFT and commits on Enter or on blur. Escape closes the
popover, the box unmounts without ever blurring, and the draft goes with it.

## Escape is not a cancel here, and cannot be

Every slider in that same panel commits LIVE — drag Hue and the color changes
under your hand, and closing keeps it. There is nothing for Escape to cancel; it
already only means "close".

So the HEX box was the one control in the panel that behaved differently, and it
behaved differently in the direction that loses work.

## Why it matters

The failure is silent, and it is silent in the worst case. When no color has been
picked yet, at least the **No color picked** badge stays up. When she is
CHANGING an existing color, there is no signal at all: the chip shows the old
color, which looks exactly like a chip showing the right color.

A colorway on Juniper Row is not decoration. It is what a shopper picks by, and
it is printed on the version's code.

## The fix

`{piggles,sparx}/apps/workbench/components/swatch-picker.tsx` — the color chip,
in one place, for both consoles.

On the way out it blurs the focused field first, which runs the picker's **own**
commit. Nothing is parsed or re-implemented here, and the Escape is not stopped:
the panel still closes, which is what the person pressing it asked for.

This belongs upstream. `ColorPicker` should commit its hex draft on unmount, and
when it does, this file is deleted and the two call sites go back to
`<ColorPicker variant="swatch">`. That is written at the top of the file so the
next person finds it.

### Where the code changed

- `{piggles,sparx}/apps/workbench/components/swatch-picker.tsx` (new)
- `piggles/apps/workbench/surfaces/commerce/product-options-value-row.tsx`
- `sparx/apps/workbench/surfaces/commerce/product-options.tsx`

## Confirmed by

P03 · Juniper Row · act 108.

Adding **Ink** to The Ash Overshirt: opened the swatch, typed `#1F2A44` over the
default, pressed **Escape**. The panel closed, the chip went deep navy, the label
read `#1F2A44`, and both the **No color picked** badge and the validation error
cleared. The colorway saved, and `ASH-OVERSHIRT-XS-INK` and its four siblings
were created behind it.

## Rating effect

`Sell › Product › Options` — recorded in [rating.md](../rating.md).
