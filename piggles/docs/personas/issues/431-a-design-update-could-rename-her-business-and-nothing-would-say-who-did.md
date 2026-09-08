# 431 — A design update could rename her business, and nothing would say who did

**Status:** fixed
**Severity:** major
**Found by:** P03 · Juniper Row · act 95
**Surface:** mypiggles › Home (the "design refreshed" banner) + Settings › Sites
**Filed:** 2026-09-06
**Fixed:** 2026-09-06

## What happened

Chasing an old note: her public tenant payload carried
`businessName: "Saffron & Sage Catering"`. Juniper Row makes clothes in Denver.

The note guessed it was another shop's name leaking across the wall between
tenants. **It was not.** No tenant on the platform is called that, and the string
appears in exactly one row: the `businessName` key inside her PRIMARY site's
`brand_override`, sitting next to her own real tagline, "Made here, in small
runs." So no tenancy boundary was crossed.

It came from a **blueprint**:

```
marketplace-catalog/blueprints/sparx-catering-events/blueprint.ts:25
    businessName: 'Saffron & Sage Catering',
```

The installer already refuses to carry that key — issue [210] made it explicit,
with the reasoning written at the spot, including how a shop came to be listed
to the public as another shop. Her row is residue from before that fix.

**But the UPDATER, the installer's twin, never got the same rule.** `brandHandler`
in `blueprint-updater.ts` read `businessName` and `tagline` out of the site's
brand override, put them through the three-way merge, and wrote them back.

That matters because of how the merge resolves. An automatic resolution
**always takes theirs** (`merge.ts`: "`auto` is always `theirs`"). So if a
blueprint's next version changes its sample business name, and the merchant never
edited hers, then **"The design your site was built from has been refreshed"
renames her business** — silently, with no conflict raised for her to see. The
tagline goes the same way, and a caterer's slogan on a clothing shop is simply a
false statement about it.

That banner was sitting on her Home screen while this was being written.

## What should have happened

A template gives you a LOOK. The name and the words are the merchant's. That was
already decided in [210]; it just was not applied to both halves of the system.

## And nobody could have found out who did it

Trying to answer "how did a caterer's name get onto her site" turned up the
second half. The audit log had every settings change and every publish on that
site, and **nothing about her business's name**, because the entire
`/v1/properties` route wrote no audit entries at all.

Measured, not assumed:

```
select action, count(*) from audit_logs where entity_type='Property' group by 1;
 builder.site.published | 126
 builder.site.reset     |   2
```

Every `Property` row in the log came from the Builder. Nothing from the site
record itself. **A site could be created, renamed, re-branded, promoted over
another, or DELETED, and nothing anywhere said who did it or what it had been
called.** The site IS the business a customer deals with; deleting one takes its
pages, layouts, forms and web addresses with it.

## The fix

**1. The updater stops carrying the two fields.** Neither is extracted and
neither is written, so no path through `brandHandler` can move them. Colors,
fonts and the logo are the look, and they are what an update is for. The
reasoning is written at the spot, pointing back at [210], so the next person does
not re-add them to be helpful.

**2. Every write to a site leaves a record.** `tenant.site.created`,
`tenant.site.updated`, `tenant.site.made_primary`, `tenant.site.deleted`, each in
the SAME transaction as the write it describes, so a rolled-back change never
leaves a log entry claiming it happened. `tenant.` rather than a module prefix,
because a property is owned above every module — the family of
`tenant.industry.installed`.

The diffs are chosen rather than dumped. `name`, `moduleScope` and the brand
override's `businessName` are recorded before and after; `settings` and the rest
of the override are recorded as "this changed". Logging whole JSON bags on every
save would bury the one line anybody ever comes looking for. The delete records
what the site WAS — `entity_id` carries no foreign key, so the entry outlives the
row it names, and the log is the only place left that can say which site it was.

## Confirmed by

Created a site called **Audit Check** through Settings › Sites, then deleted it:

```
 tenant.site.deleted | user | {"before": {"name": "Audit Check", "slug": "audit-check"}}
 tenant.site.created | user | {"after":  {"name": "Audit Check", "slug": "audit-check"}}
```

Her site count is back to seven. The row is gone; the record of it is not.

## Left as it is, and why

**Her stale `businessName` value is not cleared here.** It is dead for display
everywhere it was checked — the marketplace projection prefers `property.name`
([210]), the site chrome reads `Property.name`, and invoice rendering reads
`TenantBusiness.businessName`, which is null for her. There is already a
sanctioned script whose stated job is to strip the dead key
(`packages/db/scripts/backfill-property-name.ts`, `pnpm --filter @wizeworks/db
db:backfill:property-name`); running a backfill is a pipeline decision, not a
code one, and the key is inert until then.

**No screen can edit or clear it.** Site identity offers Site name and Tagline,
both of which write elsewhere. A key that only a script can reach is how this one
sat unnoticed for two weeks. Named rather than built: giving a deprecated key a
UI is the wrong direction, and the right one is finishing its removal.

## Rating effect

None — no new pane was scored.
