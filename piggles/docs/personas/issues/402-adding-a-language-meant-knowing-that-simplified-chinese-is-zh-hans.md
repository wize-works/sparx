# 402 — Adding a language meant knowing that Simplified Chinese is “zh-Hans”

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 81 · adding the first language to a product
**Surface:** mypiggles › Content › Translations › a product
**Filed:** 2026-09-05
**Fixed:** 2026-09-05
**Confirmed by:** French added by picking “French” from a list; no code typed anywhere

## What happened

The only way to add a language was to type its code. The whole card:

> **Add a language**
> Use the short code for the language — “es” for Spanish, “fr-CA” for Canadian
> French, “de” for German.
>
> **Language code** `[ es ]`
> Two letters for a language, optionally followed by a country — es, pt-BR,
> zh-Hans.

Devi makes clothes. She knows “Spanish”. She does not know `pt-BR`, and there is
no way on earth to guess `zh-Hans` — the help line hands her three strings and
leaves her to infer a standard from them.

## What should have happened

She picks the language by its name. The code is what gets stored, not what she
has to know.

## Why it matters

This is the console's own first rule about who it is for: assume zero technical
vocabulary in anything a person reads. BCP-47 is a specification, and a field
labelled **Language code** is a field most owners of a small shop will close.

It also gates the whole feature. Translations is not an advanced corner; it is
the difference between selling to Spanish-speaking customers or not, and its
front door asked for a string she cannot produce.

## The fix

A `<Select>` of language NAMES, sorted by name, holding the languages a small
shop actually sells in — with the regional pairs that genuinely differ in shop
copy kept apart (Brazilian vs European Portuguese, the two Chinese scripts,
Canadian French). Naming is `Intl.DisplayNames`, so the names arrive in the
reader's own language and nobody hand-maintains forty translations of
“Portuguese”. Base UI's typeahead means “French” jumps straight to it.

**The code box stays**, behind “Another language…”. A shortlist that cannot be
escaped is a ceiling, and Piggles RULE #1 is explicit that simplification never
removes capability. Its help line is unchanged for the person who wanted it.

`translation-detail.tsx` was **608 lines**, so RULE #0.5 applied on the way
through. Six files now, all under 250: the pane that loads (120), the editor
chrome (145), the draft bookkeeping as a hook (201), one language's fields (134),
one field (44), the add-a-language card (140), plus the language list (79).

## Confirmed by

Driven as Devi on The Ash Overshirt:

> Opened the picker — **Arabic, Bangla, Brazilian Portuguese, British English,
> Canadian French, Czech, Danish, Dutch, Finnish…** with no codes anywhere.
> Typed “French”, which jumped to it, pressed Enter, pressed **Add this
> language**. The French tab opened with **Save French** in the toolbar and her
> own words beside each empty box. Typed **La surchemise Ash**, saved — “French
> saved”, and the badge went from “Not saved yet” to `fr`.
>
> The list behind it now reads **Spanish** on the Marlow Knit and French on the
> Overshirt, and both render on her live site ([401]).

## Still open

- **`translations-data.ts` (361) and `translations-list.tsx` (276)** are over
  RULE #0.5's line and were not touched here — only imported from. Named rather
  than split, on the same reasoning as `content-type-detail.tsx`: taking apart a
  file this work never opened is how you break one.
- **The picker is a shortlist, not every language.** Deliberate, and the escape
  hatch is one option away; a shop needing Faroese types `fo`.
