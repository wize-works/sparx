// templateService — the two-track template surface.
//
//   builtin   → code-defined React Email components in @sparx/email. Merchants
//               customize a constrained layer (subject + intro/outro slots);
//               branding is global (brand-service). The override is an
//               EmailTemplate row (source='builtin', key=<template id>).
//   authored  → merchant-authored marketing body (a CMS TipTap doc) rendered
//               into the brand chrome via renderAuthoredEmail. Stored as an
//               EmailTemplate row (source='authored').
//
// Preview + test-send resolve the tenant brand so what the merchant sees
// matches what ships. Test-send uses the synchronous escape hatch (staff-
// triggered smoke test) and stamps tenant_id for webhook attribution.

import { withTenant } from '@sparx/db';
import type { EmailTemplate, Prisma } from '@sparx/db';
import {
  renderAuthoredEmail,
  renderTemplate,
  sendEmail,
  type DeliveryResult,
  type TemplateSend,
} from '@sparx/email';
// Serializer from the server-safe subpath so backends (api-rest, api-mcp,
// email-worker) don't pull the React/TipTap editor + @sparx/ui into runtime.
// CmsDoc is type-only (erased), so importing it from the index is fine.
import { renderDocToHtml } from '@sparx/cms-editor/serialize';
import type { CmsDoc } from '@sparx/cms-editor';

import { writeAuditLog } from '../audit';
import { publishEmailEvent } from '../events';
import { EmailNotFoundError, EmailValidationError, type ServiceContext } from '../errors';
import { BUILTIN_TEMPLATES, getBuiltinTemplate } from '../builtin-templates';
import {
  CreateAuthoredTemplateInput,
  SaveBuiltinOverrideInput,
  TestSendInput,
  UpdateAuthoredTemplateInput,
} from '../schemas/templates';
import { resolveEmailBrand } from './brand-service';
import { get as getSettings } from './settings-service';

const FALLBACK_FROM = 'Sparx <noreply@sparx.email>';

function buildFrom(fromName: string | null, fromAddress: string | null): string {
  if (!fromAddress) return process.env.SPARX_EMAIL_FROM ?? FALLBACK_FROM;
  return fromName ? `${fromName} <${fromAddress}>` : fromAddress;
}

const EMPTY_DOC: CmsDoc = { type: 'doc', content: [] };

// ── Views ──────────────────────────────────────────────────────────────────

export interface BuiltinTemplateView {
  source: 'builtin';
  key: string;
  name: string;
  kind: string;
  description: string;
  variables: string[];
  supportsSlots: boolean;
  subject: string;
  intro: string | null;
  outro: string | null;
  customized: boolean;
}

export interface AuthoredTemplateView {
  source: 'authored';
  id: string;
  name: string;
  kind: string;
  subject: string;
  preheader: string | null;
  status: string;
  updatedAt: string;
}

interface BuiltinSlots {
  slots?: { intro?: string; outro?: string };
}

function builtinView(catalogKey: string, override: EmailTemplate | undefined): BuiltinTemplateView {
  const catalog = getBuiltinTemplate(catalogKey);
  if (!catalog) throw new EmailNotFoundError('BuiltinTemplate', catalogKey);
  const body = (override?.body as BuiltinSlots | undefined) ?? {};
  return {
    source: 'builtin',
    key: catalog.key,
    name: catalog.name,
    kind: catalog.kind,
    description: catalog.description,
    variables: catalog.variables,
    supportsSlots: catalog.supportsSlots,
    subject: override?.subject ?? catalog.defaultSubject,
    intro: body.slots?.intro ?? null,
    outro: body.slots?.outro ?? null,
    customized: Boolean(override),
  };
}

function authoredView(row: EmailTemplate): AuthoredTemplateView {
  return {
    source: 'authored',
    id: row.id,
    name: row.name,
    kind: row.kind,
    subject: row.subject ?? '',
    preheader: row.preheader,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── List / get ───────────────────────────────────────────────────────────

export async function list(
  ctx: ServiceContext
): Promise<{ builtins: BuiltinTemplateView[]; authored: AuthoredTemplateView[] }> {
  return withTenant(ctx, async (tx) => {
    const rows = await tx.emailTemplate.findMany({
      where: { OR: [{ source: 'builtin' }, { source: 'authored', status: { not: 'archived' } }] },
      orderBy: { updatedAt: 'desc' },
    });
    const overrides = new Map(
      rows.filter((r) => r.source === 'builtin' && r.key).map((r) => [r.key!, r])
    );
    const builtins = BUILTIN_TEMPLATES.map((t) => builtinView(t.key, overrides.get(t.key)));
    const authored = rows.filter((r) => r.source === 'authored').map(authoredView);
    return { builtins, authored };
  });
}

export async function getBuiltin(ctx: ServiceContext, key: string): Promise<BuiltinTemplateView> {
  if (!getBuiltinTemplate(key)) throw new EmailNotFoundError('BuiltinTemplate', key);
  const override = await withTenant(ctx, (tx) =>
    tx.emailTemplate.findUnique({
      where: { tenantId_key: { tenantId: ctx.tenantId, key } },
    })
  );
  return builtinView(key, override ?? undefined);
}

export async function getAuthored(ctx: ServiceContext, id: string): Promise<EmailTemplate> {
  const row = await withTenant(ctx, (tx) => tx.emailTemplate.findUnique({ where: { id } }));
  if (row?.source !== 'authored') throw new EmailNotFoundError('EmailTemplate', id);
  return row;
}

// ── Built-in override ────────────────────────────────────────────────────

export async function saveBuiltinOverride(
  ctx: ServiceContext,
  key: string,
  rawInput: unknown
): Promise<BuiltinTemplateView> {
  const catalog = getBuiltinTemplate(key);
  if (!catalog) throw new EmailNotFoundError('BuiltinTemplate', key);
  const input = SaveBuiltinOverrideInput.parse(rawInput);

  const body: BuiltinSlots = {
    slots: {
      ...(input.intro !== undefined ? { intro: input.intro } : {}),
      ...(input.outro !== undefined ? { outro: input.outro } : {}),
    },
  };

  const row = await withTenant(ctx, async (tx) => {
    const saved = await tx.emailTemplate.upsert({
      where: { tenantId_key: { tenantId: ctx.tenantId, key } },
      create: {
        tenantId: ctx.tenantId,
        source: 'builtin',
        key,
        kind: catalog.kind,
        name: catalog.name,
        subject: input.subject ?? catalog.defaultSubject,
        body: body as Prisma.InputJsonValue,
        status: 'active',
      },
      update: {
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        body: body as Prisma.InputJsonValue,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'email.template.updated',
      entityType: 'EmailTemplate',
      entityId: saved.id,
      diff: { after: { key, subject: saved.subject } },
    });
    return saved;
  });

  await publishEmailEvent({
    tenantId: ctx.tenantId,
    topic: 'email.template.updated',
    payload: { source: 'builtin', key },
    dedupeKey: `email.template.updated:${row.id}:${row.updatedAt.toISOString()}`,
  });

  return builtinView(key, row);
}

// ── Authored CRUD ────────────────────────────────────────────────────────

export async function createAuthored(
  ctx: ServiceContext,
  rawInput: unknown
): Promise<EmailTemplate> {
  const input = CreateAuthoredTemplateInput.parse(rawInput);
  const row = await withTenant(ctx, async (tx) => {
    const created = await tx.emailTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        source: 'authored',
        kind: 'marketing',
        name: input.name,
        subject: input.subject,
        preheader: input.preheader ?? null,
        body: input.body as Prisma.InputJsonValue,
        status: 'draft',
        createdById: ctx.userId ?? null,
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'email.template.created',
      entityType: 'EmailTemplate',
      entityId: created.id,
      diff: { after: { name: created.name } },
    });
    return created;
  });
  await publishEmailEvent({
    tenantId: ctx.tenantId,
    topic: 'email.template.created',
    payload: { source: 'authored', templateId: row.id },
    dedupeKey: `email.template.created:${row.id}`,
  });
  return row;
}

export async function updateAuthored(
  ctx: ServiceContext,
  id: string,
  rawInput: unknown
): Promise<EmailTemplate> {
  const input = UpdateAuthoredTemplateInput.parse(rawInput);
  await getAuthored(ctx, id); // 404 guard

  return withTenant(ctx, async (tx) => {
    const updated = await tx.emailTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.preheader !== undefined ? { preheader: input.preheader } : {}),
        ...(input.body !== undefined ? { body: input.body as Prisma.InputJsonValue } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });
    await writeAuditLog({
      tx,
      tenantId: ctx.tenantId,
      actorId: ctx.userId ?? null,
      actorType: ctx.userId ? 'user' : 'system',
      action: 'email.template.updated',
      entityType: 'EmailTemplate',
      entityId: id,
      diff: { after: { name: updated.name, status: updated.status } },
    });
    return updated;
  });
}

export async function archiveAuthored(ctx: ServiceContext, id: string): Promise<void> {
  await getAuthored(ctx, id);
  await withTenant(ctx, (tx) =>
    tx.emailTemplate.update({ where: { id }, data: { status: 'archived' } })
  );
}

// ── Preview + test send ──────────────────────────────────────────────────

export type PreviewTarget = { source: 'builtin'; key: string } | { source: 'authored'; id: string };

export interface RenderedPreview {
  subject: string;
  html: string;
  text: string;
}

async function renderTarget(
  ctx: ServiceContext,
  target: PreviewTarget,
  to: string
): Promise<RenderedPreview & { templateId?: string }> {
  const brand = (await resolveEmailBrand(ctx)) ?? undefined;

  if (target.source === 'builtin') {
    const view = await getBuiltin(ctx, target.key);
    const catalog = getBuiltinTemplate(target.key);
    if (!catalog) throw new EmailNotFoundError('BuiltinTemplate', target.key);
    const props = {
      ...catalog.sampleProps,
      ...(view.intro ? { intro: view.intro } : {}),
      ...(view.outro ? { outro: view.outro } : {}),
    };
    const send = { template: target.key, to, props } as TemplateSend;
    const rendered = await renderTemplate(send, { brand });
    return {
      subject: view.subject,
      html: rendered.html,
      text: rendered.text,
      templateId: target.key,
    };
  }

  const row = await getAuthored(ctx, target.id);
  const doc = (row.body as CmsDoc | null) ?? EMPTY_DOC;
  const bodyHtml = renderDocToHtml(doc);
  if (!row.subject) throw new EmailValidationError('Template has no subject.');
  const rendered = await renderAuthoredEmail(
    { to, subject: row.subject, preheader: row.preheader ?? undefined, bodyHtml },
    { brand }
  );
  return { subject: row.subject, html: rendered.html, text: rendered.text };
}

export async function renderPreview(
  ctx: ServiceContext,
  target: PreviewTarget
): Promise<RenderedPreview> {
  const { subject, html, text } = await renderTarget(ctx, target, 'preview@example.com');
  return { subject, html, text };
}

export async function testSend(
  ctx: ServiceContext,
  target: PreviewTarget,
  rawInput: unknown
): Promise<DeliveryResult> {
  const { to } = TestSendInput.parse(rawInput);
  const [rendered, settings] = await Promise.all([renderTarget(ctx, target, to), getSettings(ctx)]);

  // Synchronous escape hatch — staff-triggered smoke test. Stamp tenant_id so
  // any resulting webhook events attribute correctly.
  const result = await sendEmail({
    from: buildFrom(settings.fromName, settings.fromAddress),
    to,
    replyTo: settings.replyTo ?? undefined,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(rendered.templateId ? { templateId: rendered.templateId } : {}),
    variables: { tenant_id: ctx.tenantId },
  });
  return result;
}
