// configuratorService — bundle + option-matrix-with-rules engine.
//
// Resolves a ConfigurationSelection from the storefront into a
// ResolvedConfiguration the cart can store as a line item. Pricing is
// stacked on top by the pricing pipeline (pricing-service); this engine
// only emits base + adjustment numbers + add-on lines.
//
// All writes follow the locked pattern:
//   1. Validate input via @sparx/commerce-schemas
//   2. withTenant() transaction with RLS context
//   3. writeAuditLog inside the same transaction
//   4. publishCommerceEvent AFTER commit

import {
  type ConfigurationAddOnInput,
  type ConfigurationChoiceInput,
  type ConfigurationOptionInput,
  type ConfigurationRuleAction,
  type ConfigurationRuleCondition,
  type ConfigurationRuleInput,
  ConfigurationSelection,
  CreateBundleInput,
  CreateConfigurationTemplateInput,
  type ResolvedConfiguration,
  UpdateBundleInput,
  UpdateConfigurationTemplateInput,
} from '@sparx/commerce-schemas';
import { withTenant } from '@sparx/db';
import type { Prisma, TxClient } from '@sparx/db';

import { writeAuditLog } from '../audit';
import { CommerceConflictError, CommerceNotFoundError, CommerceValidationError } from '../errors';
import type { ServiceContext } from '../errors';
import { publishCommerceEvent } from '../events';

// ─── Bundles ──────────────────────────────────────────────────────────

export interface BundleRow {
  id: string;
  bundleProductId: string;
  bundleProductTitle: string;
  pricingMode: string;
  fixedPriceCents: number | null;
  percentOffSum: number | null;
  inventoryMode: string;
  componentCount: number;
  updatedAt: string;
}

export interface BundleComponentRow {
  id: string;
  variantId: string;
  variantSku: string;
  productTitle: string;
  defaultQuantity: number;
  isRequired: boolean;
  isSwappable: boolean;
  swappableProductId: string | null;
  position: number;
}

export interface BundleDetail extends BundleRow {
  components: BundleComponentRow[];
}

export async function listBundles(ctx: ServiceContext): Promise<BundleRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.bundle.findMany({
      include: {
        bundleProduct: { select: { title: true } },
        _count: { select: { components: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      bundleProductId: r.bundleProductId,
      bundleProductTitle: r.bundleProduct.title,
      pricingMode: r.pricingMode,
      fixedPriceCents: r.fixedPriceCents,
      percentOffSum: r.percentOffSum,
      inventoryMode: r.inventoryMode,
      componentCount: r._count.components,
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}

export async function getBundle(ctx: ServiceContext, id: string): Promise<BundleDetail> {
  const row = await withTenant(ctx, (tx) =>
    tx.bundle.findFirst({
      where: { id },
      include: {
        bundleProduct: { select: { title: true } },
        _count: { select: { components: true } },
        components: {
          orderBy: { position: 'asc' },
          include: {
            variant: { select: { sku: true, product: { select: { title: true } } } },
          },
        },
      },
    })
  );
  if (!row) throw new CommerceNotFoundError('Bundle', id);
  return {
    id: row.id,
    bundleProductId: row.bundleProductId,
    bundleProductTitle: row.bundleProduct.title,
    pricingMode: row.pricingMode,
    fixedPriceCents: row.fixedPriceCents,
    percentOffSum: row.percentOffSum,
    inventoryMode: row.inventoryMode,
    componentCount: row._count.components,
    updatedAt: row.updatedAt.toISOString(),
    components: row.components.map((c) => ({
      id: c.id,
      variantId: c.variantId,
      variantSku: c.variant.sku,
      productTitle: c.variant.product.title,
      defaultQuantity: c.defaultQuantity,
      isRequired: c.isRequired,
      isSwappable: c.isSwappable,
      swappableProductId: c.productIdSwappable,
      position: c.position,
    })),
  };
}

export async function createBundle(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = CreateBundleInput.parse(rawInput);
  assertBundlePricingCoherent(input);

  const result = await withTenant(ctx, async (tx) => {
    const existing = await tx.bundle.findFirst({
      where: { bundleProductId: input.bundleProductId },
      select: { id: true },
    });
    if (existing) {
      throw new CommerceConflictError(
        `Product ${input.bundleProductId} is already a bundle wrapper`,
        'bundleProductId'
      );
    }
    await ensureProductExists(tx, input.bundleProductId);
    await ensureVariantsExist(
      tx,
      input.components.map((c) => c.variantId)
    );

    const created = await tx.bundle.create({
      data: {
        tenantId: ctx.tenantId,
        bundleProductId: input.bundleProductId,
        pricingMode: input.pricingMode,
        fixedPriceCents: input.fixedPriceCents ?? null,
        percentOffSum: input.percentOffSum ?? null,
        inventoryMode: input.inventoryMode,
        components: {
          create: input.components.map((c) => ({
            tenantId: ctx.tenantId,
            variantId: c.variantId,
            productIdSwappable: c.swappableProductId ?? null,
            defaultQuantity: c.defaultQuantity,
            isRequired: c.isRequired,
            isSwappable: c.isSwappable,
            position: c.position,
          })),
        },
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.bundle.created',
      entityType: 'Bundle',
      entityId: created.id,
      diff: {
        after: { bundleProductId: created.bundleProductId, pricingMode: created.pricingMode },
      },
    });

    return created;
  });

  return { id: result.id };
}

export async function updateBundle(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown
): Promise<void> {
  const input = UpdateBundleInput.parse(rawInput);
  if (
    input.pricingMode ||
    input.fixedPriceCents !== undefined ||
    input.percentOffSum !== undefined
  ) {
    assertBundlePricingCoherent({
      pricingMode: input.pricingMode ?? 'sum_of_components',
      fixedPriceCents: input.fixedPriceCents ?? undefined,
      percentOffSum: input.percentOffSum ?? undefined,
    });
  }

  await withTenant(ctx, async (tx) => {
    const before = await tx.bundle.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('Bundle', id);

    if (input.components) {
      await ensureVariantsExist(
        tx,
        input.components.map((c) => c.variantId)
      );
    }

    await tx.bundle.update({
      where: { id },
      data: {
        ...(input.pricingMode !== undefined ? { pricingMode: input.pricingMode } : {}),
        ...(input.fixedPriceCents !== undefined ? { fixedPriceCents: input.fixedPriceCents } : {}),
        ...(input.percentOffSum !== undefined ? { percentOffSum: input.percentOffSum } : {}),
        ...(input.inventoryMode !== undefined ? { inventoryMode: input.inventoryMode } : {}),
      },
    });

    if (input.components) {
      // Wholesale-replace components — simpler than diff-based reconciliation
      // for the editor surface, and bundle component lists are small (<=50).
      await tx.bundleComponent.deleteMany({ where: { bundleId: id } });
      await tx.bundleComponent.createMany({
        data: input.components.map((c) => ({
          tenantId: ctx.tenantId,
          bundleId: id,
          variantId: c.variantId,
          productIdSwappable: c.swappableProductId ?? null,
          defaultQuantity: c.defaultQuantity,
          isRequired: c.isRequired,
          isSwappable: c.isSwappable,
          position: c.position,
        })),
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.bundle.updated',
      entityType: 'Bundle',
      entityId: id,
      diff: {
        before: { pricingMode: before.pricingMode },
        after: { pricingMode: input.pricingMode ?? before.pricingMode },
      },
    });
  });
}

export async function deleteBundle(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.bundle.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('Bundle', id);
    await tx.bundle.delete({ where: { id } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.bundle.deleted',
      entityType: 'Bundle',
      entityId: id,
      diff: { before: { bundleProductId: before.bundleProductId } },
    });
  });
}

// ─── Configurator templates ───────────────────────────────────────────

export interface ConfigurationTemplateRow {
  id: string;
  productId: string;
  productTitle: string;
  name: string;
  description: string | null;
  status: string;
  optionCount: number;
  ruleCount: number;
  addOnCount: number;
  updatedAt: string;
}

export interface ConfigurationTemplateDetail extends ConfigurationTemplateRow {
  layout: unknown;
  options: ConfigurationOptionInput[];
  rules: ConfigurationRuleInput[];
  addOns: ConfigurationAddOnInput[];
}

export async function listTemplatesForProduct(
  ctx: ServiceContext,
  productId: string
): Promise<ConfigurationTemplateRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.configurationTemplate.findMany({
      where: { productId },
      include: {
        product: { select: { title: true } },
        _count: { select: { options: true, rules: true, addOns: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return rows.map(serializeTemplateRow);
  });
}

export async function listAllTemplates(
  ctx: ServiceContext,
  filter: { status?: string } = {}
): Promise<ConfigurationTemplateRow[]> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.configurationTemplate.findMany({
      where: { ...(filter.status ? { status: filter.status } : {}) },
      include: {
        product: { select: { title: true } },
        _count: { select: { options: true, rules: true, addOns: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return rows.map(serializeTemplateRow);
  });
}

export async function getTemplate(
  ctx: ServiceContext,
  id: string
): Promise<ConfigurationTemplateDetail> {
  const row = await withTenant(ctx, (tx) =>
    tx.configurationTemplate.findFirst({
      where: { id },
      include: {
        product: { select: { title: true } },
        _count: { select: { options: true, rules: true, addOns: true } },
        options: { orderBy: { position: 'asc' } },
        rules: { orderBy: { priority: 'desc' } },
        addOns: { orderBy: { position: 'asc' } },
      },
    })
  );
  if (!row) throw new CommerceNotFoundError('ConfigurationTemplate', id);

  return {
    ...serializeTemplateRow(row),
    layout: row.layout,
    options: row.options.map((o) => ({
      key: o.key,
      label: o.label,
      helpText: o.helpText ?? undefined,
      type: o.type as ConfigurationOptionInput['type'],
      required: o.required,
      minSelections: o.minSelections ?? undefined,
      maxSelections: o.maxSelections ?? undefined,
      defaultChoiceKeys: (Array.isArray(o.defaultChoiceKeys)
        ? o.defaultChoiceKeys
        : []) as string[],
      groupHeader: o.groupHeader ?? undefined,
      position: o.position,
      choices: (Array.isArray(o.choices) ? o.choices : []) as ConfigurationChoiceInput[],
    })),
    rules: row.rules.map((r) => ({
      name: r.name,
      match: r.match as 'all' | 'any',
      conditions: (Array.isArray(r.conditions) ? r.conditions : []) as ConfigurationRuleCondition[],
      actions: (Array.isArray(r.actions) ? r.actions : []) as ConfigurationRuleAction[],
      priority: r.priority,
    })),
    addOns: row.addOns.map((a) => ({
      variantId: a.variantId,
      defaultIncluded: a.defaultIncluded,
      priceOverrideCents: a.priceOverrideCents ?? undefined,
    })),
  };
}

export async function createTemplate(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<{ id: string }> {
  const input = CreateConfigurationTemplateInput.parse(rawInput);
  assertOptionKeysUnique(input.options);
  assertChoiceKeysUnique(input.options);
  assertRulesReferenceKnownOptions(input.rules, input.options);

  const result = await withTenant(ctx, async (tx) => {
    await ensureProductExists(tx, input.productId);
    if (input.addOns.length) {
      await ensureVariantsExist(
        tx,
        input.addOns.map((a) => a.variantId)
      );
    }
    // Collect variant IDs referenced from choices for existence check.
    const choiceVariantIds = input.options.flatMap((o) =>
      o.choices.flatMap((c) => [c.variantId, c.addOnVariantId].filter(Boolean) as string[])
    );
    if (choiceVariantIds.length) await ensureVariantsExist(tx, choiceVariantIds);

    const created = await tx.configurationTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        productId: input.productId,
        name: input.name,
        description: input.description ?? null,
        layout: input.layout as Prisma.InputJsonValue,
        status: 'draft',
        options: {
          create: input.options.map((o) => ({
            tenantId: ctx.tenantId,
            key: o.key,
            label: o.label,
            helpText: o.helpText ?? null,
            type: o.type,
            required: o.required,
            minSelections: o.minSelections ?? null,
            maxSelections: o.maxSelections ?? null,
            defaultChoiceKeys: o.defaultChoiceKeys,
            groupHeader: o.groupHeader ?? null,
            position: o.position,
            choices: o.choices as Prisma.InputJsonValue,
          })),
        },
        rules: {
          create: input.rules.map((r) => ({
            tenantId: ctx.tenantId,
            name: r.name,
            match: r.match,
            conditions: r.conditions,
            actions: r.actions,
            priority: r.priority,
          })),
        },
        addOns: {
          create: input.addOns.map((a, i) => ({
            tenantId: ctx.tenantId,
            variantId: a.variantId,
            defaultIncluded: a.defaultIncluded,
            priceOverrideCents: a.priceOverrideCents ?? null,
            position: i,
          })),
        },
      },
    });

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.configuration_template.created',
      entityType: 'ConfigurationTemplate',
      entityId: created.id,
      diff: { after: { productId: created.productId, name: created.name } },
    });

    return created;
  });

  return { id: result.id };
}

export async function updateTemplate(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown
): Promise<void> {
  const input = UpdateConfigurationTemplateInput.parse(rawInput);
  if (input.options) {
    assertOptionKeysUnique(input.options);
    assertChoiceKeysUnique(input.options);
  }
  if (input.rules && input.options) {
    assertRulesReferenceKnownOptions(input.rules, input.options);
  }

  await withTenant(ctx, async (tx) => {
    const before = await tx.configurationTemplate.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('ConfigurationTemplate', id);

    await tx.configurationTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.layout !== undefined ? { layout: input.layout as Prisma.InputJsonValue } : {}),
      },
    });

    if (input.options) {
      await tx.configurationOption.deleteMany({ where: { templateId: id } });
      await tx.configurationOption.createMany({
        data: input.options.map((o) => ({
          tenantId: ctx.tenantId,
          templateId: id,
          key: o.key,
          label: o.label,
          helpText: o.helpText ?? null,
          type: o.type,
          required: o.required,
          minSelections: o.minSelections ?? null,
          maxSelections: o.maxSelections ?? null,
          defaultChoiceKeys: o.defaultChoiceKeys,
          groupHeader: o.groupHeader ?? null,
          position: o.position,
          choices: o.choices as Prisma.InputJsonValue,
        })),
      });
    }
    if (input.rules) {
      await tx.configurationRule.deleteMany({ where: { templateId: id } });
      await tx.configurationRule.createMany({
        data: input.rules.map((r) => ({
          tenantId: ctx.tenantId,
          templateId: id,
          name: r.name,
          match: r.match,
          conditions: r.conditions,
          actions: r.actions,
          priority: r.priority,
        })),
      });
    }
    if (input.addOns) {
      await ensureVariantsExist(
        tx,
        input.addOns.map((a) => a.variantId)
      );
      await tx.configurationAddOn.deleteMany({ where: { templateId: id } });
      await tx.configurationAddOn.createMany({
        data: input.addOns.map((a, i) => ({
          tenantId: ctx.tenantId,
          templateId: id,
          variantId: a.variantId,
          defaultIncluded: a.defaultIncluded,
          priceOverrideCents: a.priceOverrideCents ?? null,
          position: i,
        })),
      });
    }

    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.configuration_template.updated',
      entityType: 'ConfigurationTemplate',
      entityId: id,
      diff: { before: { status: before.status }, after: { status: input.status ?? before.status } },
    });
  });
}

export async function deleteTemplate(ctx: ServiceContext, id: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const before = await tx.configurationTemplate.findFirst({ where: { id } });
    if (!before) throw new CommerceNotFoundError('ConfigurationTemplate', id);
    await tx.configurationTemplate.delete({ where: { id } });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'commerce.configuration_template.deleted',
      entityType: 'ConfigurationTemplate',
      entityId: id,
      diff: { before: { name: before.name } },
    });
  });
}

// ─── Resolution ───────────────────────────────────────────────────────
//
// Deterministic given a (template, selections) pair. Pure read — does
// not write a Cart row. The cart service calls this and stores the
// ResolvedConfiguration on CartItem.configurationPayload.

export async function resolve(
  ctx: ServiceContext,
  rawSelection: unknown
): Promise<ResolvedConfiguration> {
  const selection = ConfigurationSelection.parse(rawSelection);
  return runResolution(ctx, selection, false);
}

export async function validate(
  ctx: ServiceContext,
  rawSelection: unknown
): Promise<{ ok: boolean; errors: string[] }> {
  const selection = ConfigurationSelection.parse(rawSelection);
  const result = await runResolution(ctx, selection, true);
  return { ok: result.errors.length === 0, errors: result.errors };
}

async function runResolution(
  ctx: ServiceContext,
  selection: ConfigurationSelection,
  validateOnly: boolean
): Promise<ResolvedConfiguration> {
  const template = await getTemplate(ctx, selection.templateId);

  const errors: string[] = [];
  const hiddenOptions = new Set<string>();
  const ruleRequiredOptions = new Set<string>();
  const restrictedChoiceKeys = new Map<string, Set<string>>(); // optionKey → allowed choiceKeys
  const priceAdjustments: { deltaCents: number; label?: string }[] = [];
  const ruleAddOns: { variantId: string; quantity: number; label?: string }[] = [];

  // Index options + choices by key for O(1) lookups.
  const optionByKey = new Map(template.options.map((o) => [o.key, o]));
  const choiceByOptionAndKey = new Map<string, Map<string, ConfigurationChoiceInput>>();
  for (const opt of template.options) {
    const byKey = new Map<string, ConfigurationChoiceInput>();
    for (const c of opt.choices) byKey.set(c.key, c);
    choiceByOptionAndKey.set(opt.key, byKey);
  }

  // Pass 1: validate selections against option requirements.
  for (const [optKey, raw] of Object.entries(selection.selections)) {
    const opt = optionByKey.get(optKey);
    if (!opt) {
      errors.push(`Unknown option "${optKey}"`);
      continue;
    }
    const chosenKeys = normalizeChoiceKeys(raw);
    if (opt.type === 'single_choice' && chosenKeys.length > 1) {
      errors.push(`Option "${opt.label}" accepts only one selection`);
    }
    if (opt.minSelections != null && chosenKeys.length < opt.minSelections) {
      errors.push(`Option "${opt.label}" requires at least ${opt.minSelections} selection(s)`);
    }
    if (opt.maxSelections != null && chosenKeys.length > opt.maxSelections) {
      errors.push(`Option "${opt.label}" accepts at most ${opt.maxSelections} selection(s)`);
    }
    for (const k of chosenKeys) {
      if (!choiceByOptionAndKey.get(optKey)?.has(k)) {
        errors.push(`Option "${opt.label}" has no choice "${k}"`);
      }
    }
  }
  // Required-by-template options must be present.
  for (const opt of template.options) {
    if (opt.required && !(opt.key in selection.selections)) {
      errors.push(`Option "${opt.label}" is required`);
    }
  }

  // Pass 2: evaluate rules in priority order. Rules can hide options,
  // mark them required, restrict choices, adjust price, append add-ons,
  // or surface an error.
  const sortedRules = [...template.rules].sort((a, b) => b.priority - a.priority);
  for (const rule of sortedRules) {
    const matched = evaluateRule(rule, selection);
    if (!matched) continue;
    for (const action of rule.actions) {
      switch (action.kind) {
        case 'hide':
          hiddenOptions.add(action.optionKey);
          break;
        case 'require':
          ruleRequiredOptions.add(action.optionKey);
          if (!(action.optionKey in selection.selections)) {
            const opt = optionByKey.get(action.optionKey);
            errors.push(`Rule "${rule.name}" requires option "${opt?.label ?? action.optionKey}"`);
          }
          break;
        case 'show_only_choices': {
          const allow = restrictedChoiceKeys.get(action.optionKey) ?? new Set<string>();
          for (const k of action.choiceKeys) allow.add(k);
          restrictedChoiceKeys.set(action.optionKey, allow);
          // Validate any chosen keys lie within the allowed set.
          const raw = selection.selections[action.optionKey];
          if (raw !== undefined) {
            const chosen = normalizeChoiceKeys(raw);
            for (const k of chosen) {
              if (!allow.has(k)) {
                const opt = optionByKey.get(action.optionKey);
                errors.push(
                  `Rule "${rule.name}" restricts "${opt?.label ?? action.optionKey}" to ${[...allow].join(', ')}`
                );
              }
            }
          }
          break;
        }
        case 'price_adjust':
          priceAdjustments.push({ deltaCents: action.deltaCents, label: action.label });
          break;
        case 'add_addon':
          ruleAddOns.push({ variantId: action.variantId, quantity: action.quantity });
          break;
        case 'error':
          errors.push(action.message);
          break;
      }
    }
  }

  // If we're only validating, short-circuit before doing price math.
  if (validateOnly) {
    return {
      templateId: template.id,
      resolvedVariantId: null,
      resolvedSku: '',
      resolvedComponentVariantIds: [],
      addOnLines: [],
      basePriceCents: 0,
      totalAdjustmentCents: 0,
      errors,
      selectionsEcho: selection.selections,
    };
  }

  // Pass 3: figure out the resolved variant. A choice with `variantId`
  // wins over the template product's default variant. If multiple options
  // emit a variant, the first one in `position` order applies.
  let resolvedVariantId: string | null = null;
  const componentVariantIds: string[] = [];
  for (const opt of [...template.options].sort((a, b) => a.position - b.position)) {
    if (hiddenOptions.has(opt.key)) continue;
    const raw = selection.selections[opt.key];
    if (raw === undefined) continue;
    const chosen = normalizeChoiceKeys(raw);
    for (const k of chosen) {
      const choice = choiceByOptionAndKey.get(opt.key)?.get(k);
      if (!choice) continue;
      if (choice.variantId && !resolvedVariantId) {
        resolvedVariantId = choice.variantId;
      }
      if (choice.variantId) componentVariantIds.push(choice.variantId);
      if (choice.priceDeltaCents) {
        priceAdjustments.push({
          deltaCents: choice.priceDeltaCents,
          label: `${opt.label}: ${choice.label}`,
        });
      }
    }
  }

  // Pass 4: resolve add-on lines. defaultIncluded addons + addOnVariantId
  // from chosen choices + add_addon from rules. We need variant SKUs +
  // prices to build the lines, so load them in one query.
  const choiceAddOnVariants: { variantId: string; label?: string }[] = [];
  for (const opt of template.options) {
    if (hiddenOptions.has(opt.key)) continue;
    const raw = selection.selections[opt.key];
    if (raw === undefined) continue;
    const chosen = normalizeChoiceKeys(raw);
    for (const k of chosen) {
      const choice = choiceByOptionAndKey.get(opt.key)?.get(k);
      if (choice?.addOnVariantId) {
        choiceAddOnVariants.push({
          variantId: choice.addOnVariantId,
          label: `${opt.label}: ${choice.label}`,
        });
      }
    }
  }
  const defaultAddOnVariants = template.addOns
    .filter((a) => a.defaultIncluded)
    .map((a) => ({ variantId: a.variantId, override: a.priceOverrideCents ?? null }));

  const allVariantIds = Array.from(
    new Set(
      [
        ...(resolvedVariantId ? [resolvedVariantId] : []),
        ...componentVariantIds,
        ...defaultAddOnVariants.map((a) => a.variantId),
        ...choiceAddOnVariants.map((a) => a.variantId),
        ...ruleAddOns.map((a) => a.variantId),
      ].filter(Boolean)
    )
  );

  const variantsById = new Map<string, { id: string; sku: string; priceCents: number }>();
  if (allVariantIds.length) {
    const rows = await withTenant(ctx, (tx) =>
      tx.productVariant.findMany({
        where: { id: { in: allVariantIds } },
        select: { id: true, sku: true, priceCents: true },
      })
    );
    for (const r of rows) variantsById.set(r.id, r);
  }

  // Base price: chosen variant > product default variant > 0.
  let basePriceCents = 0;
  let resolvedSku = '';
  if (resolvedVariantId) {
    const v = variantsById.get(resolvedVariantId);
    if (v) {
      basePriceCents = v.priceCents;
      resolvedSku = v.sku;
    }
  } else {
    const defaultVariant = await withTenant(ctx, (tx) =>
      tx.productVariant.findFirst({
        where: { productId: template.productId, isDefault: true },
        select: { id: true, sku: true, priceCents: true },
      })
    );
    if (defaultVariant) {
      basePriceCents = defaultVariant.priceCents;
      resolvedSku = defaultVariant.sku;
      resolvedVariantId = defaultVariant.id;
    }
  }

  const addOnLines: ResolvedConfiguration['addOnLines'] = [];
  for (const a of defaultAddOnVariants) {
    const v = variantsById.get(a.variantId);
    if (!v) continue;
    addOnLines.push({
      variantId: a.variantId,
      quantity: 1,
      unitPriceCents: a.override ?? v.priceCents,
    });
  }
  for (const a of choiceAddOnVariants) {
    const v = variantsById.get(a.variantId);
    if (!v) continue;
    addOnLines.push({
      variantId: a.variantId,
      quantity: 1,
      unitPriceCents: v.priceCents,
      label: a.label,
    });
  }
  for (const a of ruleAddOns) {
    const v = variantsById.get(a.variantId);
    if (!v) continue;
    addOnLines.push({
      variantId: a.variantId,
      quantity: a.quantity,
      unitPriceCents: v.priceCents,
      label: a.label,
    });
  }

  const totalAdjustmentCents = priceAdjustments.reduce((acc, p) => acc + p.deltaCents, 0);

  return {
    templateId: template.id,
    resolvedVariantId,
    resolvedSku,
    resolvedComponentVariantIds: componentVariantIds,
    addOnLines,
    basePriceCents,
    totalAdjustmentCents,
    errors,
    selectionsEcho: selection.selections,
  };
}

// ─── Quote bridge ─────────────────────────────────────────────────────
//
// Configurations too bespoke for the rule grammar (or that the merchant
// wants sales-rep review on) flow into the CRM Quote workflow. The
// configurator emits the event; a downstream consumer in @sparx/crm
// creates the Quote and links back via metadata.

export async function requestQuote(
  ctx: ServiceContext,
  input: {
    selection: unknown;
    customerId?: string;
    b2bAccountId?: string;
    notes?: string;
  }
): Promise<{ requestId: string }> {
  const selection = ConfigurationSelection.parse(input.selection);
  // We resolve first so the published event carries a fully-priced
  // snapshot; the CRM consumer reads it to seed the Quote line items
  // and pricing — sales never starts from a raw selection blob.
  const resolved = await runResolution(ctx, selection, false);

  const requestId = crypto.randomUUID();
  await publishCommerceEvent({
    tenantId: ctx.tenantId,
    actorId: ctx.userId ?? null,
    topic: 'configuration.requested',
    data: {
      requestId,
      templateId: selection.templateId,
      customerId: input.customerId ?? null,
      b2bAccountId: input.b2bAccountId ?? null,
      notes: input.notes ?? null,
      resolved,
    },
  });
  return { requestId };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function serializeTemplateRow(row: {
  id: string;
  productId: string;
  name: string;
  description: string | null;
  status: string;
  updatedAt: Date;
  product: { title: string };
  _count: { options: number; rules: number; addOns: number };
}): ConfigurationTemplateRow {
  return {
    id: row.id,
    productId: row.productId,
    productTitle: row.product.title,
    name: row.name,
    description: row.description,
    status: row.status,
    optionCount: row._count.options,
    ruleCount: row._count.rules,
    addOnCount: row._count.addOns,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertBundlePricingCoherent(input: {
  pricingMode: string;
  fixedPriceCents?: number | null;
  percentOffSum?: number | null;
}): void {
  if (
    input.pricingMode === 'fixed' &&
    (input.fixedPriceCents == null || input.fixedPriceCents < 0)
  ) {
    throw new CommerceValidationError('pricingMode=fixed requires fixedPriceCents');
  }
  if (input.pricingMode === 'percent_off_sum' && input.percentOffSum == null) {
    throw new CommerceValidationError('pricingMode=percent_off_sum requires percentOffSum');
  }
}

function assertOptionKeysUnique(options: ConfigurationOptionInput[]): void {
  const seen = new Set<string>();
  for (const o of options) {
    if (seen.has(o.key)) {
      throw new CommerceValidationError(`Duplicate option key "${o.key}"`);
    }
    seen.add(o.key);
  }
}

function assertChoiceKeysUnique(options: ConfigurationOptionInput[]): void {
  for (const o of options) {
    const seen = new Set<string>();
    for (const c of o.choices) {
      if (seen.has(c.key)) {
        throw new CommerceValidationError(
          `Duplicate choice key "${c.key}" within option "${o.key}"`
        );
      }
      seen.add(c.key);
    }
  }
}

function assertRulesReferenceKnownOptions(
  rules: ConfigurationRuleInput[],
  options: ConfigurationOptionInput[]
): void {
  const known = new Set(options.map((o) => o.key));
  for (const r of rules) {
    for (const c of r.conditions) {
      if (!known.has(c.optionKey)) {
        throw new CommerceValidationError(
          `Rule "${r.name}" references unknown option "${c.optionKey}"`
        );
      }
    }
    for (const a of r.actions) {
      if ('optionKey' in a && !known.has(a.optionKey)) {
        throw new CommerceValidationError(
          `Rule "${r.name}" references unknown option "${a.optionKey}"`
        );
      }
    }
  }
}

function evaluateRule(rule: ConfigurationRuleInput, selection: ConfigurationSelection): boolean {
  const results = rule.conditions.map((c) => evaluateCondition(c, selection));
  return rule.match === 'all' ? results.every(Boolean) : results.some(Boolean);
}

function evaluateCondition(
  condition: ConfigurationRuleCondition,
  selection: ConfigurationSelection
): boolean {
  const raw = selection.selections[condition.optionKey];
  if (raw === undefined) return false;
  switch (condition.op) {
    case 'in': {
      const chosen = normalizeChoiceKeys(raw);
      const allow = Array.isArray(condition.value) ? condition.value : [String(condition.value)];
      return chosen.some((k) => allow.includes(k));
    }
    case 'not_in': {
      const chosen = normalizeChoiceKeys(raw);
      const deny = Array.isArray(condition.value) ? condition.value : [String(condition.value)];
      return chosen.every((k) => !deny.includes(k));
    }
    case 'eq':
      return String(raw) === String(condition.value);
    case 'gt': {
      const n = Number(raw);
      const v = Number(condition.value);
      return Number.isFinite(n) && Number.isFinite(v) && n > v;
    }
    case 'lt': {
      const n = Number(raw);
      const v = Number(condition.value);
      return Number.isFinite(n) && Number.isFinite(v) && n < v;
    }
  }
}

function normalizeChoiceKeys(raw: string | string[] | number | boolean): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'boolean') return raw ? ['true'] : ['false'];
  return [String(raw)];
}

async function ensureProductExists(tx: TxClient, productId: string): Promise<void> {
  const row = await tx.product.findFirst({ where: { id: productId }, select: { id: true } });
  if (!row) throw new CommerceNotFoundError('Product', productId);
}

async function ensureVariantsExist(tx: TxClient, variantIds: string[]): Promise<void> {
  if (variantIds.length === 0) return;
  const unique = Array.from(new Set(variantIds));
  const rows = await tx.productVariant.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  const found = new Set(rows.map((r) => r.id));
  for (const id of unique) {
    if (!found.has(id)) throw new CommerceNotFoundError('ProductVariant', id);
  }
}
