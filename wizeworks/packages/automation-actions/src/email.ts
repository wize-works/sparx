// Email action executors (docs/81 §5.4, docs/84 Slice F1).
//
// Two effects that PUBLISH a send (never direct-deliver — docs/81 §5.4): they
// enqueue a `ScheduledSend` via `@wizeworks/email-sends`' `enqueueSend`, which the
// api-rest email-dispatch tick later turns into an `email.send`. That keeps
// suppression, the per-recipient render, and Mailgun delivery exactly where they
// already live, and — crucially — lets these run inside the lean automation-worker
// WITHOUT dragging the @wizeworks/email/@wizeworks/ui render closure into its image
// (`@wizeworks/email-sends` depends only on @wizeworks/db). The render half stays in
// api-rest's dispatch tick, which has the email/builder libs.
//
//   email.send_campaign  — customer-addressed marketing send. Recipient is the
//     trigger's `customer.email`; respects the CRM do-not-contact flag (the
//     email suppression list is the other gate, enforced in enqueueSend). Body is
//     a published Builder email (`defer`, personalized at dispatch) OR a coded
//     template.
//   email.send_internal  — staff notification (deal-closing alert, etc.). Sent to
//     a configured address as a raw body; transactional scope so it isn't blocked
//     by a customer's marketing unsubscribe and isn't anchored to a customer.
//
// Gate manifest: both produce an EXTERNAL effect (an email leaves the system), but
// no send-volume gate exists yet — the global gates (tenant-active, kill-switch,
// `module: 'email'` active) plus the in-service suppression check are the controls
// today. A dedicated rate/volume gate is a future addition (docs/81 §7.1).

import {
  registerAction,
  type ActionOutput,
  type EffectInput,
  type TenantCtx,
} from '@wizeworks/automation';
import { enqueueSend, type ScheduledSendBody } from '@wizeworks/email-sends';
import { z } from 'zod';

import {
  interpolateFields,
  optionalBoolField,
  optionalEntityId,
  requireStringField,
  resolveTenantActor,
} from './entity.js';

/** The entity ids a designed (Builder) email resolves its DataSources against at
 *  dispatch (docs/91 §3), read from the trigger's resolved fields. */
function entityRefsFromFields(fields: EffectInput['fields']): Record<string, string | null> {
  return {
    customerId: optionalEntityId(fields, 'customer.id') ?? null,
    orderId: optionalEntityId(fields, 'order.id') ?? null,
    cartId: optionalEntityId(fields, 'cart.id') ?? null,
    quoteId: optionalEntityId(fields, 'quote.id') ?? null,
    billingDocumentId: optionalEntityId(fields, 'invoice.id') ?? null,
    companyId: optionalEntityId(fields, 'b2bAccount.id') ?? null,
    subscriptionId: optionalEntityId(fields, 'subscription.id') ?? null,
    returnId: optionalEntityId(fields, 'return.id') ?? null,
    // The parcel, not just the order. `shipping-confirmation` asks for this ref
    // by name; without it the render falls back to the latest parcel on the
    // order, which is the wrong tracking number for an order that ships in two.
    fulfillmentId: optionalEntityId(fields, 'fulfillment.id') ?? null,
    // The booking. The console offers "Somebody books an appointment" as a
    // trigger and the resolver hydrates the booking, so CONDITIONS on it work —
    // but the booking email sources resolve from this ref alone, with no fallback.
    // Without it an owner's own "when someone books, email them" automation sends
    // a confirmation with the date, the time and the service all blank.
    bookingId: optionalEntityId(fields, 'booking.id') ?? null,
  };
}

// The site an automation send is on behalf of (docs/49 Phase 7b) — read from
// the trigger entity's resolved fields so the eventual render uses that site's
// brand. We probe the conventional carriers in priority order; absent → null (a
// tenant-wide send → tenant brand). Lights up per-site automation branding the
// moment a property-scoped trigger (e.g. an order stamped with its site) flows.
function resolveSourceProperty(fields: Parameters<typeof optionalEntityId>[0]): string | null {
  return (
    optionalEntityId(fields, 'propertyId') ??
    optionalEntityId(fields, 'order.propertyId') ??
    optionalEntityId(fields, 'customer.propertyId') ??
    null
  );
}

// Body source for a campaign: a built-in default by KEY (the system-seed path —
// resolved to the tenant's provisioned/overridden tree at dispatch), a designed
// Builder email by id (a tenant broadcast), OR a coded template. Exactly one —
// modeled as a union so config can't supply more than one.
const CampaignConfig = z.union([
  // System-seed path (docs/91 §6): reference a provisioned default by `key`.
  // `emailType` is the declared intent — it drives the suppression scope AND the
  // dispatch compliance gate (docs/91 §8). subject/preheader are optional
  // overrides; omitted ⇒ the tenant-editable template's own values are used.
  z.object({
    builderEmailKey: z.string().min(1),
    emailType: z.enum(['transactional', 'marketing']),
    subject: z.string().min(1).optional(),
    preheader: z.string().optional(),
    delaySeconds: z.number().int().min(0).optional(),
  }),
  z.object({
    builderEmailId: z.string().uuid(),
    subject: z.string().min(1),
    preheader: z.string().optional(),
    delaySeconds: z.number().int().min(0).optional(),
  }),
  z.object({
    template: z.string().min(1),
    props: z.record(z.string(), z.unknown()).optional(),
    delaySeconds: z.number().int().min(0).optional(),
  }),
]);

const InternalConfig = z.object({
  // Recipient resolution, in priority order (docs/90 §3b): a field path on the
  // trigger entity (e.g. a conversation's assigned-staff email), an explicit
  // address, then the tenant's notify address (owner email → tenant contact).
  toField: z.string().min(1).optional(),
  to: z.string().email().optional(),
  subject: z.string().min(1),
  // Body is optional — a staff alert's subject IS the message. When neither html
  // nor text is given, the text body defaults to the subject at execution.
  html: z.string().optional(),
  text: z.string().optional(),
  delaySeconds: z.number().int().min(0).optional(),
});

let installed = false;

/** Register the email action executors exactly once (idempotent). */
export function installEmailActions(): void {
  if (installed) return;
  installed = true;

  registerAction({
    type: 'email.send_campaign',
    module: 'email',
    gates: [],
    manifestNote:
      'external effect: enqueues a suppression-checked ScheduledSend (marketing) that the email-dispatch tick sends; module-active + kill-switch gates apply',
    async execute(ctx: TenantCtx, effect: EffectInput): Promise<ActionOutput> {
      const cfg = CampaignConfig.parse(effect.config);
      const recipient = requireStringField(effect.fields, 'customer.email', 'email.send_campaign');

      // A built-in (`builderEmailKey`) declares its intent; a designed/coded send
      // is marketing by default (the legacy broadcast contract). The scope drives
      // which suppression entries block the send: a `transactional` campaign (a
      // welcome, an invoice reminder, a dunning notice) must NOT be withheld by a
      // marketing-scope unsubscribe — only an `all` suppression stops it.
      const emailType = 'emailType' in cfg ? cfg.emailType : 'marketing';
      const scope = emailType === 'marketing' ? 'marketing' : 'transactional';

      // Defense in depth: skip a contact the CRM flagged do-not-contact — but only
      // for MARKETING. A do-not-contact flag is a marketing opt-out; an operational
      // transactional email (invoice, account approval) still sends. The email
      // suppression list (scoped, in enqueueSend) is the second gate.
      if (
        scope === 'marketing' &&
        optionalBoolField(effect.fields, 'customer.doNotContact') === true
      ) {
        return { recipient, enqueued: false, skipped: 'do_not_contact' };
      }

      const customerId = optionalEntityId(effect.fields, 'customer.id') ?? null;
      // A designed send (`builderEmailKey` | `builderEmailId`) renders a Builder
      // tree per-recipient at dispatch; a `template` send is a coded component.
      const isDesigned = 'builderEmailKey' in cfg || 'builderEmailId' in cfg;
      let body: ScheduledSendBody;
      if ('builderEmailKey' in cfg) {
        body = {
          defer: {
            builderEmailKey: cfg.builderEmailKey,
            emailType: cfg.emailType,
            // Optional overrides; omitted ⇒ dispatch uses the resolved template's
            // own (tenant-editable) subject/preheader.
            ...(cfg.subject ? { subject: cfg.subject } : {}),
            ...(cfg.preheader ? { preheader: cfg.preheader } : {}),
          },
        };
      } else if ('builderEmailId' in cfg) {
        body = {
          defer: {
            builderEmailId: cfg.builderEmailId,
            subject: cfg.subject,
            preheader: cfg.preheader,
          },
        };
      } else {
        body = { template: cfg.template, props: cfg.props };
      }

      const { enqueued, suppressed } = await enqueueSend(
        { tenantId: ctx.tenantId, tx: ctx.tx },
        {
          recipient,
          customerId,
          propertyId: resolveSourceProperty(effect.fields),
          scope,
          delaySeconds: cfg.delaySeconds,
          body,
          variables: { source: 'automation' },
          // A designed email resolves its DataSources from the firing entity at
          // dispatch (docs/91 §3); carry the refs + the trigger-time snapshot.
          ...(isDesigned
            ? {
                entityRefs: entityRefsFromFields(effect.fields),
                entitySnapshot: effect.fields,
              }
            : {}),
        }
      );
      return { recipient, enqueued, suppressed };
    },
  });

  registerAction({
    type: 'email.send_internal',
    // Platform-level: an internal staff alert is a transactional notification, not
    // a marketing capability, so it is NOT gated on the email module (docs/90 §3b —
    // "no email module required"). It rides the platform transactional send path the
    // same way OTP does; only the global tenant-active + kill-switch gates apply.
    module: null,
    gates: [],
    manifestNote:
      'external effect: enqueues a transactional ScheduledSend to a staff address (platform-level — no email-module gate; tenant-active + kill-switch apply)',
    async execute(ctx: TenantCtx, effect: EffectInput): Promise<ActionOutput> {
      const cfg = InternalConfig.parse(effect.config);
      // Recipient: a trigger-field email → an explicit address → the tenant notify
      // address (owner email → tenant contact). A staff alert with no resolvable
      // recipient is a config error — fail loud rather than send to nobody.
      const fromField = cfg.toField ? optionalEntityId(effect.fields, cfg.toField) : undefined;
      const recipient = fromField ?? cfg.to ?? (await resolveTenantActor(ctx)).email;
      if (!recipient) {
        throw new Error(
          'email.send_internal: no recipient resolved and the tenant has no contact.'
        );
      }
      // Internal mail is pre-rendered here, so its `{{token}}` merge fields resolve
      // now against the trigger's flat fields (docs/90 §3 internal alerts).
      const body: ScheduledSendBody = {
        raw: {
          subject: interpolateFields(cfg.subject, effect.fields),
          html: interpolateFields(cfg.html ?? '', effect.fields),
          // Default the text body to the subject so a subject-only alert still has
          // a body (an internal notification's subject is its content).
          text: interpolateFields(cfg.text ?? cfg.subject, effect.fields),
        },
      };
      const { enqueued, suppressed } = await enqueueSend(
        { tenantId: ctx.tenantId, tx: ctx.tx },
        {
          recipient,
          propertyId: resolveSourceProperty(effect.fields),
          scope: 'transactional',
          delaySeconds: cfg.delaySeconds,
          body,
          variables: { source: 'automation:internal' },
        }
      );
      return { recipient: cfg.to, enqueued, suppressed };
    },
  });
}
