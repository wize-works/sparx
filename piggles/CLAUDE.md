# CLAUDE.md — Piggles

Guidance for Claude Code when working anywhere under `piggles/`. This file is
**binding** for Piggles work and takes precedence over the root
[CLAUDE.md](../CLAUDE.md) wherever the two disagree. Where it is silent, the root
file still applies.

Piggles is WizeWorks' second brand: the same platform, a different product. Not "sparx Lite", not a reskin, not a fork.

## RULE #0 — Piggles and sparx are two applications. Neither may touch the other.

**Either product must be deletable tomorrow without affecting the other.**
Delete `sparx/` and Piggles keeps working. Delete `piggles/` and sparx keeps
working. That is the test, and it is the whole rule — and since the tree move it
is **proven** rather than asserted: `pnpm check:deletability` walks Piggles'
real dependency closure and fails if anything in it lives under `sparx/`.

`piggles/apps/workbench` therefore contains its **own copy** of everything it
renders — the surfaces, the dock plumbing, the controller, the registry, the
API routes. It imports nothing from `sparx/apps/workbench`, there is no `@workbench/*`
alias, and no path in `piggles/` climbs out into `sparx/`.

| Layer                                                   | Owner           | Piggles may                          |
| ------------------------------------------------------- | --------------- | ------------------------------------ |
| `wizeworks/**` (packages, services, admin, site)        | shared platform | import — libraries, not an app       |
| `sparx/**` (its brand package + web, market, workbench) | sparx           | read and edit — but **never import** |
| `piggles/**`                                            | Piggles         | own outright                         |

**The rule is the IMPORT, not the edit.** A correction found in one console is
usually owed to the other — `check:console-parity` exists to say so — and making
it twice is the point. What must never happen is one tree reaching into the
other: no import, no path alias, no shared module living under a brand.
`check:deletability` and `check:boundaries` are what prove it, and they are the
things to run after touching both. (This row read "nothing. Never read, never
edit." until 2026-09-05, which turned every shared correction into a blocked
issue — see the persona register, 407.)

Both brands run on **one database and one tenant pool**. A tenant belongs to the
brand it signed up under, recorded on **`Tenant.platformBrand`** (a `String`,
defaulting to `"sparx"`), and never changes brands. It is deliberately NOT called
`brand` — that name is already the model's relation to `TenantBrand`, which is
the tenant's OWN branding and a different thing entirely. Sharing a DATABASE is
not sharing an application: the database is a service both speak to, and either
app can be deleted without disturbing it.

### The `@sparx/*` scope is retiring

The shared packages are named `@sparx/*` because sparx was the only product when
they were written. They are platform code and always were — a Prisma client, a
query wrapper, a schema set — but a package Piggles cannot boot without, wearing
another brand's name, is not something you can point at and call independent.

They are being renamed to `@wizeworks/*` and moved to a `wizeworks/` tree; the
plan, its phases and the running checklist are in
[docs/migration/](docs/migration/). Until that lands:

- **Do not add a new `@sparx/*` dependency from `piggles/`.** The
  `check:boundaries` script counts them per package against a recorded baseline
  and fails the push if any count rises. Falling is the only permitted direction.
- **`@sparx/brand` and `@wizeworks/ui` are OFF LIMITS entirely.** Those two genuinely
  carry sparx — its marks, its mascot, its token values — and Piggles has
  `@piggles/brand`, `@piggles/mascot` and `@piggles/ui` of its own. Both were
  dropped from the console on 2026-08-16 along with the five places it was
  rendering sparx's wordmark and mascot.
- A correction both brands need goes in a **brand-blind** package, never in one
  brand's. `@wizeworks/silica-corrections` exists for exactly that reason.

### Why this was not always the rule, and what it cost

The console was originally built to MOUNT `sparx/apps/workbench` through a tsconfig
alias — 84 imports, with `piggles/CLAUDE.md` telling you to "mount them, never
fork them". It looked like the disciplined choice and it was the expensive one:

- Every Piggles wording change had to be made in sparx's tree, behind a seam,
  and ~350 of sparx's files ended up carrying Piggles-shaped machinery.
- A build error in Piggles surfaced as a build error in sparx.
- Deleting either product would have broken the other.

That was undone on 2026-08-14. `sparx/apps/workbench` was restored to its committed
state, the tree was copied into `piggles/`, and every import was repointed at
`@/`. **Do not reintroduce it.** If a fix is needed in both products, make it
twice — that cost is real, and it is smaller than the coupling.

### What still holds from the old rule

**Feature code never branches on brand.** No `if (brand === 'piggles')`
anywhere. Piggles' copy is Piggles' — change it directly rather than adding a
conditional. Brand reaches the UI through tokens, the app registry and the
lexicon, and a product adapter (`lib/product.ts`) is still the tidy way to keep
wording out of a hundred components; it is just Piggles' own file now.

### A sparx PRODUCT is not a Piggles capability

**sparx.market, sparx Pay, sparx Commerce, the sparx partner directory — these do
not exist in Piggles. Exclude them. Do not rename them, and do not ask.**

The surfaces are full of them because they were originally written for sparx's
customers, and Piggles' copy inherited every one. Three ways to get this wrong,
in order of how bad they are:

1. **Renaming.** "Piggles.market" and "Piggles Pay" are products nobody can sign
   up for. A brand-name swap makes the sentence grammatical, on-voice, and false
   — which is worse than the leak, because now nothing looks wrong.
2. **Asking.** The boundary already answered it. A different product does not
   inherit another product's marketplace, and treating that as an open question
   is deferring a decision that was made the day Piggles became a second brand.
3. **Leaving it.** A Piggles customer offered a listing on another company's
   marketplace is a bug with a support ticket attached.

The seams exist, so use them: `hiddenSurfaces` for a whole surface,
`hiddenFeatures` for a block inside one — both in
[lib/product.ts](sparx/apps/workbench/lib/product.ts), both declared in
[lib/console/product.tsx](sparx/apps/workbench/lib/console/product.tsx). Both files are
Piggles' own; nothing here reaches into another application.

**The one genuine exception, which must be argued rather than assumed:** a
capability WizeWorks operates for both brands under two names. That is a product
decision with a real Piggles-side thing behind it — a domain that resolves, an
account that exists — and it is Brandon's to make. Absent that, the default is
exclude.

## RULE #0.5 — Files in `piggles/` requirements

1. **No file shall be more than 250 lines long.** If it is, split it into a `components/` or `lib/` subdirectory.
2. **No methods shall be more than 50 lines long.** If it is, split it into a helper function or a subcomponent.
3. **Comments must be short and precise.** If a comment is more than 3 lines long, it is probably explaining a design flaw that should be fixed instead of explained.
4. **If you touch a file in `piggles/`, you must apply this rule set to it.** If you are editing a file that is already too long, you must split it into smaller files. If you are adding a new file, you must make sure it is not too long.

## RULE #1 — Piggles is not a smaller product

Every capability sparx has, Piggles has. Simplification comes from **terminology,
hierarchy, defaults, onboarding, progressive disclosure, and intent-based
actions** — never from removing capability.

A user is never blocked from an ordinary business capability because of what they
bought. Enabling an app changes the **workspace**, not the **price**.

## RULE #2 — no module pricing

sparx charges per active module. **Piggles does not, and must never grow tiers.**
One flat plan, every app included, capacity limits protecting the economics:

- $99/month, 1 business, 1 location, 1 primary site, 3 users included
- capacity metered on storage, email volume, contacts, and seats
- no Basic/Pro/Enterprise unless product strategy changes explicitly
- a founding-member discount is a COUPON on that one price, never a second plan

Three consequences that are easy to miss:

1. **Meter from day one, even before you bill on it.** Usage tiers set later need
   historical data to be priced, and that data cannot be backfilled.
2. **Every app ships enabled, so the nav is full on day one.** sparx uses module
   activation as progressive disclosure and Piggles cannot. Onboarding asks _what
   do you do?_ and uses the answer to **hide**, never to gate — everything stays
   one click from discoverable.
3. **A capacity limit never stops work in progress, and never degrades what
   already exists.** The action in flight completes; only new additions of that
   one kind pause afterwards. Exceeding storage does not unpublish a site;
   exceeding contacts does not hide contacts; transactional mail is never
   capacity-gated. Full posture:
   [BILLING_RULES.md](docs/initial/docs/commercial/BILLING_RULES.md).

**Expansion is one tap, in place, with the price on the button** — never a trip to
Settings and never a redirect to another domain. Get Piggles owns capacity
_management_ (the full dashboard, payment methods, invoices, reducing capacity);
My Piggles carries the _quick path_ — one meter's state at the point of friction
and the one-tap action for that meter. Reading "don't duplicate billing logic" as
"redirect to billing" is the specific mistake to avoid.

The testable version of that boundary: **the console never knows a price.** A
narrow account-service endpoint returns the priced option and executes it; My
Piggles renders the label it is handed. A price computed or hardcoded in console
code means billing logic has leaked, however thin it looks. Split table:
[BILLING_RULES.md](docs/initial/docs/commercial/BILLING_RULES.md).

One-tap purchase is only honest if removing the block is equally self-serve.

**Accounts flagged `system` are never metered, warned, or blocked** — an explicit
auditable flag, never inferred from an email domain or a plan value, and never
settable from a tenant-facing surface.

## RULE #3 — speak like a person

The vocabulary is a product adapter, not decoration. Canonical map:
[config/terminology.yaml](docs/initial/config/terminology.yaml).

| sparx         | Piggles   |
| ------------- | --------- |
| Workbench     | Home      |
| module        | App       |
| enable module | Add app   |
| tenant        | Business  |
| Site Builder  | My Site   |
| CMS           | Content   |
| SEO           | Get Found |
| Commerce      | Sell      |
| Inventory     | Stock     |
| CRM           | Customers |
| Email         | Messages  |
| Scheduling    | Bookings  |
| Finance       | Money     |
| RBAC          | Access    |
| MDI           | Workspace |

The generating rule: **sparx names things by category, Piggles names them by what
you are doing.** A shop owner does not have a CRM; they have customers.

Never make a user understand CMS, CRM, headless, MDI, RBAC, collections, price
books, or GraphQL outside an explicitly advanced or developer context.

**Playful, never childish.** Capable, friendly, mildly mischievous — and never
silly during serious work. Money, tax, payroll and deletion are plain and calm.
**Do not rename features into pig puns.** The mascot earns its keep in empty
states, onboarding and success moments, not in the nav.

## The three surfaces

| Domain            | App                      | What it is                                            |
| ----------------- | ------------------------ | ----------------------------------------------------- |
| `meetpiggles.com` | `piggles/apps/web`       | discover and understand                               |
| `getpiggles.com`  | `piggles/apps/account`   | authenticate, sign up, onboard, provision, **pay us** |
| `mypiggles.com`   | `piggles/apps/workbench` | operate the business                                  |

The `getpiggles` / `mypiggles` split is deliberate and load-bearing: **the money
a customer pays WizeWorks** and **the money a customer's own customers pay them**
are different concerns, and merging them is what made this confusing in sparx.
Keep platform billing out of the operating console.

**Cross-domain auth.** Three registrable domains cannot share a cookie, so
`getpiggles.com` is the auth authority and `mypiggles.com` has no sign-in UI at
all. Unauthenticated hits bounce to the account app, which mints a single-use,
origin-bound, short-TTL exchange token and redirects to
`mypiggles.com/auth/callback`; that route exchanges it server-side and sets its own
cookie on its own domain. Both cookies address **one Better Auth session row**, so
logout, expiry and revocation stay consistent for free. No third-party cookies —
nothing to break in Safari.

Attribution cannot ride a cookie across those domains either: `meetpiggles.com`
serialises the first-touch payload into the signup link at click time, and the
account app captures it first-party.

## Where things live

```
piggles/
  apps/          web (meet) · account (get) · workbench (my)
  packages/      brand · config · ui compositions
  docs/initial/  the approved source pack — brand board, PRD, architecture
  CLAUDE.md      this file
  DESIGN.md      the design contract
```

[docs/initial/](docs/initial/) is the **approved source pack** and outranks
anything inferred from sparx. Read [00_START_HERE.md](docs/initial/00_START_HERE.md)
and the relevant `docs/` node before non-trivial work. Note
[BRAND_CORRECTION.md](docs/initial/BRAND_CORRECTION.md): the canonical accent is
**pink/coral**; every yellow reference is superseded.

## Which root rules still apply

**Still binding** — root RULE #1 (silicaui first, Tailwind second; feature code
chooses, never paints), RULE #2 (no eyebrows), RULE #4 (`neutral` needs Brandon's
approval, every time),
the no-gradients rule, the 16px body floor, the no-inline-`style` rule, explicit-
save editors, destructive actions behind `useConfirm`, and every architectural
convention in the root file (RLS, Better Auth, Pub/Sub events, the release
pipeline, migration monotonicity).

**Superseded for Piggles** — the visual restraint clauses, and **the root
no-shadows rule most of all.** Roundness, warmth, the mascot and elevation are
Piggles' identity, not drift. Do not import sparx's flat, cool, sharp-edged
defaults into a Piggles surface just because they are the repo's habit.

**Shadows are a Piggles device, and `shadow-*` in feature code is sanctioned.**
The palette is soft and warm, so a hairline border separates two surfaces far
more weakly here than it does on sparx's cool greys — elevation is what does that
work instead. Lift a panel, a card, a band, a dock window: reach for Tailwind's
`shadow-*` scale, which is the shared ladder everything else on the page is
already using.

The one thing that is still wrong is **stacking**. `--depth: 1` already gives
silica's own Card, Button, Dialog and Popover a resting shadow, so adding
`shadow-*` on top of one of those doubles it up and reads as a rendering fault
rather than as depth. Silica paints it → leave it alone. Piggles owns it → lift
it yourself. Detail and the worked examples: [DESIGN.md](DESIGN.md) §4 and §8.

## Environment

Same as the root file: **never** run `prisma migrate` / `db push` / `generate`
against shared docker, never start or restart the dev server, and never commit or
push — leave work in the tree and report the changed files.
