# 379 — A customer's email address was painted over the sentence beside it

**Status:** fixed
**Severity:** minor
**Found by:** P03 · Juniper Row · opening the account area as her customer Marguerite
**Surface:** any tenant site › /account and every page under it
**Filed:** 2026-09-01
**Fixed:** 2026-09-01
**Confirmed by:** the same page, measured, with the address now inside its own column

## What happened

Marguerite signs in to check an order. Her own email address, at the top of the
account sidebar, runs out of the sidebar and over the sentence in the next column:

> marguerite.adeyemi@example.**com**Manage your orders and details here.

Measured on the page rather than read off a screenshot:

| Thing                               | Value    |
| ----------------------------------- | -------- |
| The sidebar column                  | 220px    |
| The address's box                   | 196px    |
| The address's painted text          | 267px    |
| Where the next column's text starts | 427px    |
| Where the address's text ends       | 438px    |
| **Overlap**                         | **11px** |

`scrollWidth` 267 against `clientWidth` 196 — the text was 71px wider than the box
holding it, and simply painted outside it.

## Why it happened

The account layout puts the nav in a fixed grid column:

```
grid-cols-[220px_minmax(0,1fr)]
```

and prints the customer's address in it with nothing that lets it break:

```tsx
<span className="text-base-content">{customer.email}</span>
```

**An email address is one unbreakable token.** There is no space in it, so normal
word wrapping has nothing to wrap at, and the browser paints it straight out of the
box. At that font size the column fits roughly 22 characters, so this was not a
rare long address — it hit most real ones. `marguerite.adeyemi@example.com` is 30.

The line above it has the same shape: `displayName` falls back to `customer.email`
when a customer has no first name, so a signed-in shopper with no name given got
the address twice, both overflowing.

## The fix

`break-all` on both lines, and `min-w-0` on the block that holds them so it can
shrink inside the flex column rather than being sized by its widest child. It is
the idiom already used six times across the console for exactly this — API key
prefixes, action types, host addresses.

The address wraps onto two lines inside the sidebar. It is not truncated: a
customer checking which address they are signed in under has to be able to read
all of it, so an ellipsis would be the wrong answer here even though it looks
tidier.

## Confirming it

Same page, same customer, measured again:

| Check                         | Before     | After      |
| ----------------------------- | ---------- | ---------- |
| Address text vs its box       | 267 vs 196 | 196 vs 196 |
| Gap to the next column's text | **-11px**  | no overlap |
| Overflow                      | yes        | none       |

Walked the whole account area afterwards — Overview, Orders, Returns, Estimates,
Requests, Wishlist, Addresses, Payment methods, Profile — all 200, all reading
correctly, and `/account` holds at 360px with no sideways scroll.

## Still open

- **The Returns page says "Refund" without saying how much.** Her own Shipping and
  returns page states that "the $9 comes off the refund" if a customer takes money
  back rather than an exchange, and neither the return row nor her Return Policy
  repeats it. That is the same gap [375] records on the policy side.
