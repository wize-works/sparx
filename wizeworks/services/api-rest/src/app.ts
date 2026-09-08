// Fastify factory. Tests import createApp() to spin up an in-memory instance
// (no listen()); the bootstrap in index.ts wraps it with listen() + signal
// handlers. Keeping the two split is a Fastify convention worth observing.
//
// Shared Fastify primitives (auth, error envelope, db helpers, audit,
// pubsub, content-type validation) live in @wizeworks/api-core. This service
// composes the factories with its own env config and stays focused on
// REST-only route plumbing. GraphQL is a separate service (api-graphql).

import { randomUUID } from 'node:crypto';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyServerOptions,
} from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import { CrmConflictError, CrmNotFoundError, CrmValidationError } from '@wizeworks/crm';
import {
  SitebuilderConflictError,
  SitebuilderNotFoundError,
  SitebuilderValidationError,
} from '@wizeworks/sitebuilder';
import {
  BuilderConflictError,
  BuilderNotFoundError,
  BuilderValidationError,
} from '@wizeworks/builder';
import {
  CommerceConflictError,
  CommerceNotFoundError,
  CommerceOutOfStockError,
  CommercePricingError,
  CommerceProviderError,
  CommerceValidationError,
} from '@wizeworks/commerce';
import {
  InventoryConflictError,
  InventoryNotFoundError,
  InventoryOutOfStockError,
  InventoryValidationError,
} from '@wizeworks/inventory';
import {
  EmailConflictError,
  EmailNotFoundError,
  EmailProviderError,
  EmailValidationError,
} from '@wizeworks/email-platform';
import {
  AutomationNotFoundError,
  AutomationVersionNotFoundError,
  LockedAutomationError,
  NoDraftError,
} from '@wizeworks/automation';
import {
  BookingNotFoundError,
  InvalidBookingStateError,
  LocationInUseError,
  NoEligibleResourceError,
  ResourceNotFoundError as SchedulingResourceNotFoundError,
  SchedulingError,
  ServiceNotFoundError as SchedulingServiceNotFoundError,
  SlotUnavailableError,
} from '@wizeworks/scheduling';
import { FinanceError } from '@wizeworks/finance';
import { StaffError } from '@wizeworks/staff';
import { createAuthPlugin } from '@wizeworks/api-core/auth';
import { createErrorsPlugin, type ErrorEnvelope } from '@wizeworks/api-core/errors-plugin';
import { env } from './env.js';
import openapiPlugin from './plugins/openapi.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import healthRoutes from './routes/health.js';
import domainCheckRoutes from './routes/internal/domain-check.js';
import crmCronRoutes from './routes/internal/crm-cron.js';
import commerceCronRoutes from './routes/internal/commerce-cron.js';
import invoicingCronRoutes from './routes/internal/invoicing-cron.js';
import dropshipCronRoutes from './routes/internal/dropship-cron.js';
import automationCronRoutes from './routes/internal/automation-cron.js';
import usageCronRoutes from './routes/internal/usage-cron.js';
import siteAnalyticsCronRoutes from './routes/internal/site-analytics-cron.js';
import seoCronRoutes from './routes/internal/seo-cron.js';
import inventoryCronRoutes from './routes/internal/inventory-cron.js';
import financeCronRoutes from './routes/internal/finance-cron.js';
import staffCronRoutes from './routes/internal/staff-cron.js';
import channelsCronRoutes from './routes/internal/channels-cron.js';
import marketCronRoutes from './routes/internal/market-cron.js';
import acquisitionReportRoutes from './routes/internal/acquisition-report.js';
import furnishTenantRoutes from './routes/internal/furnish-tenant.js';
import internalPartnerRoutes from './routes/internal/partners.js';
import operatorInternalRoutes from './routes/internal/operator.js';
import operatorBillingRoutes from './routes/internal/operator-billing.js';
import operatorDomainsRoutes from './routes/internal/operator-domains.js';
import operatorSupportRoutes from './routes/internal/operator-support.js';
import operatorFeedbackRoutes from './routes/internal/operator-feedback.js';
import operatorTenantRoutes from './routes/internal/operator-tenant.js';
import operatorPartnerRoutes from './routes/internal/operator-partners.js';
import operatorUserRoutes from './routes/internal/operator-users.js';
import operatorSiteRoutes from './routes/internal/operator-sites.js';
import operatorAnnouncementRoutes from './routes/internal/operator-announcements.js';
import contentTypeRoutes from './routes/v1/content/types.js';
import entryRoutes from './routes/v1/content/entries.js';
import publishRoutes from './routes/v1/content/publish.js';
import revisionRoutes from './routes/v1/content/revisions.js';
import previewTokenRoutes from './routes/v1/content/preview-tokens.js';
import contentReportRoutes from './routes/v1/content/reports.js';
import contentAnalyticsRoutes from './routes/v1/content/content-analytics.js';
import navigationRoutes from './routes/v1/navigation/menus.js';
import redirectRoutes from './routes/v1/redirects/index.js';
import authorRoutes from './routes/v1/authors/index.js';
import taxonomyRoutes from './routes/v1/taxonomies/index.js';
import webhookRoutes from './routes/v1/webhooks/subscriptions.js';
import webhookDeliveryRoutes from './routes/v1/webhooks/deliveries.js';
import stripeBillingWebhookRoutes from './routes/v1/webhooks/stripe-billing.js';
import providerWebhookRoutes from './routes/v1/webhooks/providers.js';
import paymentWebhookRoutes from './routes/v1/webhooks/payments.js';
import sitemapRoutes from './routes/v1/sitemap.js';
import rssRoutes from './routes/v1/rss.js';
import publicContentRoutes from './routes/v1/public/content.js';
import publicCommerceRoutes from './routes/v1/public/commerce.js';
import publicMarketRoutes from './routes/v1/public/market.js';
import publicSearchRoutes from './routes/v1/public/search.js';
import publicCartRoutes from './routes/v1/public/cart.js';
import publicCheckoutRoutes from './routes/v1/public/checkout.js';
import publicReviewRoutes from './routes/v1/public/reviews.js';
import publicAccountRoutes from './routes/v1/public/account.js';
import publicPaymentMethodRoutes from './routes/v1/public/payment-methods.js';
import publicReturnsAccountRoutes from './routes/v1/public/returns-account.js';
import publicAuthRoutes from './routes/v1/public/auth.js';
import publicSiteSnapshotRoutes from './routes/v1/public/site-snapshot.js';
import publicSiteRoutes from './routes/v1/public/site.js';
import publicSiteInfoRoutes from './routes/v1/public/site-info.js';
import publicBuilderRoutes from './routes/v1/public/builder.js';
import publicMediaRoutes from './routes/v1/public/media.js';
import publicMediaUploadRoutes from './routes/v1/public/media-upload.js';
import marketplaceMediaRoutes from './routes/v1/public/marketplace-media.js';
import publicConsentRoutes from './routes/v1/public/consent.js';
import publicSignupRoutes from './routes/v1/public/signup.js';
import publicSiteAnalyticsRoutes from './routes/v1/public/site-analytics.js';
import publicNewsletterRoutes from './routes/v1/public/newsletter.js';
import publicToolsRoutes from './routes/v1/public/tools.js';
import publicCareersRoutes from './routes/v1/public/careers.js';
import publicFormsRoutes from './routes/v1/public/forms.js';
import publicFormsUploadRoutes from './routes/v1/public/forms-upload.js';
import publicDeliverRoutes from './routes/v1/public/deliver.js';
import publicSmsInboundRoutes from './routes/v1/public/sms-inbound.js';
import publicMarketplaceRoutes from './routes/v1/public/marketplace.js';
import publicPartnerRoutes from './routes/v1/public/partners.js';
import publicBootcampRoutes from './routes/v1/public/bootcamps.js';
import publicAnnouncementRoutes from './routes/v1/public/announcements.js';
import partnerRoutes from './routes/v1/partner/index.js';
import partnerBootcampRoutes from './routes/v1/partner/bootcamps.js';
import tenantPartnerRoutes from './routes/v1/tenant-partner.js';
import publicRedirectRoutes from './routes/v1/public/redirects.js';
import publicB2bPortalRoutes from './routes/v1/public/b2b-portal.js';
import publicEstimateRoutes from './routes/v1/public/estimates.js';
import publicSchedulingRoutes from './routes/v1/public/scheduling.js';
import publicDocumentRoutes from './routes/v1/public/documents.js';
import schedulingAccountRoutes from './routes/v1/public/scheduling-account.js';
import schedulingManageRoutes from './routes/v1/public/scheduling-manage.js';
import crmRequestRoutes from './routes/v1/public/crm-requests.js';
import schedulingCalendarRoutes from './routes/v1/public/scheduling-calendar.js';
import schedulingCalendarPushRoutes from './routes/v1/public/scheduling-calendar-push.js';
import crmCallStatusRoutes from './routes/v1/public/crm-call-status.js';
import uploadRoutes from './routes/v1/media/uploads.js';
import mediaAssetRoutes from './routes/v1/media/assets.js';
import mediaCollectionRoutes from './routes/v1/media/collections.js';
import crmRoutes from './routes/v1/crm/index.js';
import orderRoutes from './routes/v1/orders.js';
import invoicingRoutes from './routes/v1/invoicing/index.js';
import financeRoutes from './routes/v1/finance/index.js';
import staffRoutes from './routes/v1/staff/index.js';
import funnelRoutes from './routes/v1/funnels/index.js';
import funnelsCronRoutes from './routes/internal/funnels-cron.js';
import b2bRoutes from './routes/v1/b2b/index.js';
import chatRoutes from './routes/v1/chat/index.js';
import publicChatRoutes from './routes/v1/public/chat.js';
import pushRoutes from './routes/v1/push.js';
import sitebuilderRoutes from './routes/v1/sitebuilder/index.js';
import builderRoutes from './routes/v1/builder/index.js';
import analyticsRoutes from './routes/v1/analytics/index.js';
import formsRoutes from './routes/v1/forms.js';
import commerceRoutes from './routes/v1/commerce/index.js';
import presetRoutes from './routes/v1/presets.js';
import savedViewRoutes from './routes/v1/saved-views.js';
import industryStarterRoutes from './routes/v1/industry-starters.js';
import sampleDataRoutes from './routes/v1/sample-data.js';
import dropshipRoutes from './routes/v1/dropship/index.js';
import inventoryRoutes from './routes/v1/inventory/index.js';
import marketRoutes from './routes/v1/market/index.js';
import channelRoutes from './routes/v1/channels/index.js';
import socialRoutes from './routes/v1/social/index.js';
// The one catalog of everything connectable, across every category.
import integrationRoutes from './routes/v1/integrations/index.js';
import schedulingRoutes from './routes/v1/scheduling/index.js';
import tenantRoutes from './routes/v1/tenant.js';
import tenantBusinessRoutes from './routes/v1/tenant-business.js';
import billingRoutes from './routes/v1/billing.js';
import usageRoutes from './routes/v1/usage.js';
import brandRoutes from './routes/v1/brand.js';
import propertiesRoutes from './routes/v1/properties.js';
import blueprintRoutes from './routes/v1/blueprints/index.js';
import marketplaceRoutes from './routes/v1/marketplace/index.js';
import domainsRoutes from './routes/v1/domains.js';
import legalRoutes from './routes/v1/legal.js';
import meRoutes from './routes/v1/me.js';
import feedbackRoutes from './routes/v1/feedback.js';
import userRoutes from './routes/v1/users.js';
import teamRoutes from './routes/v1/team.js';
import emailTestRoutes from './routes/v1/email/test.js';
import emailRoutes from './routes/v1/email/index.js';
import emailWebhookRoutes from './routes/v1/public/email-webhook.js';
import emailUnsubscribeRoutes from './routes/v1/public/email-unsubscribe.js';
import channelWebhookRoutes from './routes/v1/public/channel-webhooks.js';
import socialMetaCallbackRoutes from './routes/v1/public/social-meta-callbacks.js';
import dashboardRoutes from './routes/v1/dashboard.js';
import jobsRoutes from './routes/v1/jobs.js';
import migrationRoutes from './routes/v1/migration.js';
import activityRoutes from './routes/v1/activity.js';
import notificationRoutes from './routes/v1/notifications.js';
import notificationPreferenceRoutes from './routes/v1/notification-preferences.js';
import searchRoutes from './routes/v1/search.js';
import seoAuditRoutes from './routes/v1/seo/audit.js';
import seoReportRoutes from './routes/v1/seo/reports.js';
import searchConsoleRoutes from './routes/v1/seo/search-console.js';
import organicRoutes from './routes/v1/seo/organic.js';
import aiReportRoutes from './routes/v1/ai/reports.js';
import aiPromptTemplateRoutes from './routes/v1/ai/prompt-templates.js';
import aiToolPolicyRoutes from './routes/v1/ai/tool-policies.js';
import aiCredentialRoutes from './routes/v1/ai/credentials.js';
import aiApiKeyRoutes from './routes/v1/ai/api-keys.js';
import aiMcpConnectionRoutes from './routes/v1/ai/mcp-connections.js';
import automationRoutes from './routes/v1/automations/index.js';
import platformRoutes from './routes/v1/platform/index.js';
import { bootstrapProviders } from './lib/providers-bootstrap.js';
import pretty from 'pino-pretty';

function loggerOptions(): FastifyServerOptions['logger'] {
  if (env.NODE_ENV === 'test') return false;
  if (env.NODE_ENV === 'development') {
    // pino-pretty as a SYNCHRONOUS in-process stream — NOT a `transport`
    // worker. The worker path runs through thread-stream, which crashes the
    // whole server on boot under Node 24 with an inspector attached
    // ("Error: this should not happen: undefined"). A direct sync stream keeps
    // the colorized dev logs with no worker thread to fall over.
    return {
      level: env.LOG_LEVEL,
      stream: pretty({
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        sync: true,
      }),
    };
  }
  return { level: env.LOG_LEVEL };
}

// CRM service-layer errors share the platform vocabulary (NOT_FOUND /
// VALIDATION_ERROR / CONFLICT) — register them as extra mappers so the
// generic api-core plugin doesn't need to know CRM exists.
function crmErrorMapper(
  err: unknown,
  request: { id: string },
  reply: FastifyReply
): FastifyReply | undefined {
  const requestId = request.id;
  if (err instanceof CrmNotFoundError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: err.message,
        details: { entityType: err.entityType, entityId: err.entityId },
        request_id: requestId,
      },
    };
    return reply.code(404).send(body);
  }
  if (err instanceof CrmValidationError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details,
        request_id: requestId,
      },
    };
    return reply.code(422).send(body);
  }
  if (err instanceof CrmConflictError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'CONFLICT',
        message: err.message,
        ...(err.field !== undefined ? { details: { field: err.field } } : {}),
        request_id: requestId,
      },
    };
    return reply.code(409).send(body);
  }
  return undefined;
}

function sitebuilderErrorMapper(
  err: unknown,
  request: { id: string },
  reply: FastifyReply
): FastifyReply | undefined {
  const requestId = request.id;
  if (err instanceof SitebuilderNotFoundError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: err.message,
        details: { entityType: err.entityType, entityId: err.entityId },
        request_id: requestId,
      },
    };
    return reply.code(404).send(body);
  }
  if (err instanceof SitebuilderValidationError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details,
        request_id: requestId,
      },
    };
    return reply.code(422).send(body);
  }
  if (err instanceof SitebuilderConflictError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'CONFLICT',
        message: err.message,
        ...(err.field !== undefined ? { details: { field: err.field } } : {}),
        request_id: requestId,
      },
    };
    return reply.code(409).send(body);
  }
  return undefined;
}

// Builder (the docs/40 composition-model editor) service-layer errors — same
// envelope vocabulary as Site Builder. Separate package, separate mapper.
function builderErrorMapper(
  err: unknown,
  request: { id: string },
  reply: FastifyReply
): FastifyReply | undefined {
  const requestId = request.id;
  if (err instanceof BuilderNotFoundError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: err.message,
        details: { entityType: err.entityType, entityId: err.entityId },
        request_id: requestId,
      },
    };
    return reply.code(404).send(body);
  }
  if (err instanceof BuilderValidationError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details,
        request_id: requestId,
      },
    };
    return reply.code(422).send(body);
  }
  if (err instanceof BuilderConflictError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'CONFLICT',
        message: err.message,
        ...(err.field !== undefined ? { details: { field: err.field } } : {}),
        request_id: requestId,
      },
    };
    return reply.code(409).send(body);
  }
  return undefined;
}

// Commerce service-layer errors — same envelope vocabulary as CRM (decision
// #7: one error language across modules). Out-of-stock + pricing-error +
// provider-error get distinct codes since the storefront / dashboard have
// specific recovery paths for each.
function commerceErrorMapper(
  err: unknown,
  request: { id: string },
  reply: FastifyReply
): FastifyReply | undefined {
  const requestId = request.id;
  if (err instanceof CommerceNotFoundError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: err.message,
        details: { entityType: err.entityType, entityId: err.entityId },
        request_id: requestId,
      },
    };
    return reply.code(404).send(body);
  }
  if (err instanceof CommerceValidationError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details,
        request_id: requestId,
      },
    };
    return reply.code(422).send(body);
  }
  if (err instanceof CommerceConflictError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'CONFLICT',
        message: err.message,
        ...(err.field !== undefined ? { details: { field: err.field } } : {}),
        request_id: requestId,
      },
    };
    return reply.code(409).send(body);
  }
  if (err instanceof CommerceOutOfStockError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'OUT_OF_STOCK',
        message: err.message,
        details: {
          variantId: err.variantId,
          requested: err.requested,
          available: err.available,
        },
        request_id: requestId,
      },
    };
    return reply.code(409).send(body);
  }
  if (err instanceof CommercePricingError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'PRICING_ERROR',
        message: err.message,
        details: { reason: err.reason, trace: err.trace },
        request_id: requestId,
      },
    };
    return reply.code(422).send(body);
  }
  if (err instanceof CommerceProviderError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'PROVIDER_ERROR',
        message: err.message,
        details: {
          providerSlug: err.providerSlug,
          providerErrorCode: err.providerErrorCode,
          retryable: err.retryable,
        },
        request_id: requestId,
      },
    };
    return reply.code(502).send(body);
  }
  return undefined;
}

// Inventory service-layer errors (@wizeworks/inventory — its own error vocabulary,
// same envelope codes as commerce/crm). Out-of-stock keeps a distinct code so
// the storefront/dashboard can offer a wait-list / back-order recovery path.
function inventoryErrorMapper(
  err: unknown,
  request: { id: string },
  reply: FastifyReply
): FastifyReply | undefined {
  const requestId = request.id;
  if (err instanceof InventoryNotFoundError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: err.message,
        details: { entityType: err.entityType, entityId: err.entityId },
        request_id: requestId,
      },
    };
    return reply.code(404).send(body);
  }
  if (err instanceof InventoryValidationError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details,
        request_id: requestId,
      },
    };
    return reply.code(422).send(body);
  }
  if (err instanceof InventoryConflictError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'CONFLICT',
        message: err.message,
        ...(err.field !== undefined ? { details: { field: err.field } } : {}),
        request_id: requestId,
      },
    };
    return reply.code(409).send(body);
  }
  if (err instanceof InventoryOutOfStockError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'OUT_OF_STOCK',
        message: err.message,
        details: {
          variantId: err.variantId,
          requested: err.requested,
          available: err.available,
        },
        request_id: requestId,
      },
    };
    return reply.code(409).send(body);
  }
  return undefined;
}

// Email-platform service-layer errors — same envelope vocabulary as CRM, with
// PROVIDER_ERROR (→ 502) for Mailgun admin failures the tenant should see.
function emailErrorMapper(
  err: unknown,
  request: { id: string },
  reply: FastifyReply
): FastifyReply | undefined {
  const requestId = request.id;
  if (err instanceof EmailNotFoundError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: err.message,
        details: { entityType: err.entityType, entityId: err.entityId },
        request_id: requestId,
      },
    };
    return reply.code(404).send(body);
  }
  if (err instanceof EmailValidationError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: err.message,
        details: err.details,
        request_id: requestId,
      },
    };
    return reply.code(422).send(body);
  }
  if (err instanceof EmailConflictError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'CONFLICT',
        message: err.message,
        ...(err.field !== undefined ? { details: { field: err.field } } : {}),
        request_id: requestId,
      },
    };
    return reply.code(409).send(body);
  }
  if (err instanceof EmailProviderError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'PROVIDER_ERROR',
        message: err.message,
        details: { provider: err.provider, ...(err.status ? { status: err.status } : {}) },
        request_id: requestId,
      },
    };
    return reply.code(502).send(body);
  }
  return undefined;
}

// Automation engine service-layer errors. The LOCKED-tier guard is a state
// conflict (the rule is platform-managed) — 409 with a distinct code so the
// dashboard can offer "Duplicate to edit" rather than a generic failure.
function automationErrorMapper(
  err: unknown,
  request: { id: string },
  reply: FastifyReply
): FastifyReply | undefined {
  const requestId = request.id;
  if (err instanceof AutomationNotFoundError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: err.message,
        details: { entityType: 'Automation', entityId: err.automationId },
        request_id: requestId,
      },
    };
    return reply.code(404).send(body);
  }
  if (err instanceof LockedAutomationError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'AUTOMATION_LOCKED',
        message: err.message,
        details: { automationId: err.automationId },
        request_id: requestId,
      },
    };
    return reply.code(409).send(body);
  }
  if (err instanceof AutomationVersionNotFoundError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: err.message,
        details: {
          entityType: 'AutomationVersion',
          automationId: err.automationId,
          version: err.version,
        },
        request_id: requestId,
      },
    };
    return reply.code(404).send(body);
  }
  if (err instanceof NoDraftError) {
    // Nothing staged to publish — a state conflict, distinct code so the
    // dashboard can quietly no-op rather than surface a generic error.
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: 'AUTOMATION_NO_DRAFT',
        message: err.message,
        details: { automationId: err.automationId },
        request_id: requestId,
      },
    };
    return reply.code(409).send(body);
  }
  return undefined;
}

// Scheduling engine errors (@wizeworks/scheduling) — same envelope vocabulary as the
// other modules. SLOT_UNAVAILABLE (a lost race against the DB no-overlap EXCLUDE)
// gets a distinct 409 code so the booking surface can re-fetch availability and
// ask the customer to pick again; invalid-state transitions are also a 409.
//
// CLOSED_FOR_DATE and OUTSIDE_WORKING_HOURS deliberately fall through to the
// generic 422: a clash is a race (retry may win), while a closed week and a
// lunch break are settled facts about a well-formed request the engine cannot
// honour. Their `message` carries the specifics the surface prints.
function schedulingErrorMapper(
  err: unknown,
  request: { id: string },
  reply: FastifyReply
): FastifyReply | undefined {
  const requestId = request.id;
  if (
    err instanceof BookingNotFoundError ||
    err instanceof SchedulingResourceNotFoundError ||
    err instanceof SchedulingServiceNotFoundError
  ) {
    const body: ErrorEnvelope = {
      success: false,
      error: { code: 'NOT_FOUND', message: err.message, request_id: requestId },
    };
    return reply.code(404).send(body);
  }
  if (err instanceof SlotUnavailableError) {
    const body: ErrorEnvelope = {
      success: false,
      error: { code: 'SLOT_UNAVAILABLE', message: err.message, request_id: requestId },
    };
    return reply.code(409).send(body);
  }
  if (err instanceof InvalidBookingStateError) {
    const body: ErrorEnvelope = {
      success: false,
      error: { code: 'INVALID_BOOKING_STATE', message: err.message, request_id: requestId },
    };
    return reply.code(409).send(body);
  }
  if (err instanceof NoEligibleResourceError) {
    const body: ErrorEnvelope = {
      success: false,
      error: { code: 'NO_ELIGIBLE_RESOURCE', message: err.message, request_id: requestId },
    };
    return reply.code(422).send(body);
  }
  if (err instanceof LocationInUseError) {
    // 409 rather than 422 for the same reason a protected finance category is
    // (see financeErrorMapper): the request is well-formed and the fix is a
    // DIFFERENT ACTION — switch the location off — not a corrected field.
    const body: ErrorEnvelope = {
      success: false,
      error: { code: 'LOCATION_IN_USE', message: err.message, request_id: requestId },
    };
    return reply.code(409).send(body);
  }
  if (err instanceof SchedulingError) {
    // A *_NOT_FOUND code (calendar connection, booking policy) is a 404; every
    // other engine error is a 422 (a well-formed request the engine can't honor).
    const status = err.code.endsWith('_NOT_FOUND') ? 404 : 422;
    const body: ErrorEnvelope = {
      success: false,
      error: { code: err.code, message: err.message, request_id: requestId },
    };
    return reply.code(status).send(body);
  }
  return undefined;
}

// Finance errors (@wizeworks/finance) — same envelope vocabulary as the rest.
//
// Two get their own status on purpose. Over-allocating an expense is a 422: the
// request is well-formed, it just charges jobs for money nobody spent. A
// protected/in-use category is a 409, because the fix is a different action
// (archive it, or re-file its spend) rather than a corrected field — and the
// message already says which, in words an owner can act on.
function financeErrorMapper(
  err: unknown,
  request: { id: string },
  reply: FastifyReply
): FastifyReply | undefined {
  if (!(err instanceof FinanceError)) return undefined;
  const requestId = request.id;

  const status = err.code.endsWith('_NOT_FOUND')
    ? 404
    : err.code === 'SYSTEM_CATEGORY_PROTECTED' || err.code === 'CATEGORY_IN_USE'
      ? 409
      : 422;

  const body: ErrorEnvelope = {
    success: false,
    error: { code: err.code, message: err.message, request_id: requestId },
  };
  return reply.code(status).send(body);
}

// Staff errors (@wizeworks/staff) — same envelope vocabulary again.
//
// Three are 409s, and they share a shape: the request is fine, the WORLD is in a
// state that has to change first, and the message already says which change.
// Overlapping a pay rate wants the existing window ended; editing approved time
// wants it reopened; deriving wages with no finance module wants finance turned
// on. A 422 would tell the caller to fix a field, and there is no field to fix.
//
// Everything else falls through to 422 — a well-formed request the module cannot
// honour (clocking in twice, clocking out when nobody is clocked in, a shift
// window that inverts).
function staffErrorMapper(
  err: unknown,
  request: { id: string },
  reply: FastifyReply
): FastifyReply | undefined {
  if (!(err instanceof StaffError)) return undefined;

  const status = err.code.endsWith('_NOT_FOUND')
    ? 404
    : err.code === 'STAFF_PAY_RATE_OVERLAP' ||
        err.code === 'STAFF_TIME_APPROVED_LOCKED' ||
        err.code === 'STAFF_WAGES_CATEGORY_MISSING'
      ? 409
      : 422;

  const body: ErrorEnvelope = {
    success: false,
    error: { code: err.code, message: err.message, request_id: request.id },
  };
  return reply.code(status).send(body);
}

export async function createApp(): Promise<FastifyInstance> {
  // Populate the integration-framework registry + wire the SecretReader
  // before any route can call providerService.runPayment*.
  bootstrapProviders();

  const app = Fastify({
    logger: loggerOptions(),
    // Per docs/06-api-specification.md every error response carries a
    // `request_id` of the form `req_<hex>` — Fastify exposes it as
    // `request.id` everywhere once configured here.
    genReqId: () => `req_${randomUUID().replace(/-/g, '')}`,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'request_id',
    // X-Forwarded-* — sparx-prod sits behind Caddy.
    trustProxy: true,
    disableRequestLogging: false,
    bodyLimit: 5 * 1024 * 1024, // 5 MiB — rich-text bodies, not media (those upload direct-to-GCS).
  });

  // Raw-bytes parser for local-mode media uploads. In prod (GCS) the
  // browser PUTs directly to a signed Cloud Storage URL and the bytes
  // never touch api-rest; this parser only fires in dev / test where the
  // local storage backend serves the "presigned" URL itself. Routes that
  // want a Buffer just declare a per-route `bodyLimit` and inspect
  // `request.body`.
  app.addContentTypeParser(
    /^(application\/octet-stream|application\/pdf|image\/.+|video\/.+|audio\/.+)$/,
    { parseAs: 'buffer', bodyLimit: 200 * 1024 * 1024 },
    (_req, body, done) => {
      done(null, body);
    }
  );

  // Order matters: errors → openapi → rate-limit → auth → routes. Error
  // handler must be registered first so it catches anything that throws
  // from the others. OpenAPI must be initialised before routes register so
  // each route's schema is recorded.
  await app.register(
    createErrorsPlugin({
      extraMappers: [
        crmErrorMapper,
        commerceErrorMapper,
        inventoryErrorMapper,
        sitebuilderErrorMapper,
        builderErrorMapper,
        emailErrorMapper,
        automationErrorMapper,
        schedulingErrorMapper,
        financeErrorMapper,
        staffErrorMapper,
      ],
    })
  );
  await app.register(openapiPlugin);
  await app.register(rateLimitPlugin);
  // Every tenant/custom domain (and api.sparx.works itself) is a distinct
  // origin from the browser's perspective — there is no fixed allowlist to
  // write, so reflect the request Origin rather than enumerate one. Safe
  // because no public route reads an auth cookie directly (the one
  // cookie-based session, sparx_customer_session, is only ever read via
  // wizeworks/apps/site's own same-origin proxy route, never a direct cross-origin
  // fetch), so credentials stay off.
  //
  // `methods` must be explicit: @fastify/cors defaults to GET,HEAD,POST, which
  // silently strands every browser-origin PATCH/PUT/DELETE at preflight. The
  // dashboard never noticed (it calls api-rest from the server); the workbench
  // calls from the browser and does full CRUD with a Bearer token.
  await app.register(cors, {
    origin: true,
    credentials: false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  // Cookie support — used by the storefront customer session (httpOnly
  // sparx_customer_session). Unsigned: the session token is already a
  // high-entropy opaque value stored only as a SHA-256 hash server-side.
  await app.register(cookie);
  await app.register(
    createAuthPlugin({
      jwtSecret: env.SPARX_INTERNAL_JWT_SECRET,
      publicPrefixes: [
        '/v1/openapi.json',
        '/v1/sitemap.xml',
        '/v1/public/',
        // OAuth discovery for the shopper AS (docs/113 §5) — RFC 8414 mandates the
        // metadata at the store-root `.well-known`, outside `/v1/public/`. Public
        // by definition (a client must read it pre-token).
        '/.well-known/',
        // Local-mode media upload endpoints — issued by `presignPut` and
        // self-authorising via the in-URL object key. Skipping the Bearer
        // check here mirrors the GCS signed-URL contract.
        '/v1/media/_local/',
      ],
    })
  );

  // Surface request_id on every response (success or failure) so callers
  // logging a 5xx have something to send back to support.
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  await app.register(healthRoutes);
  await app.register(domainCheckRoutes);
  await app.register(crmCronRoutes);
  await app.register(commerceCronRoutes);
  await app.register(invoicingCronRoutes);
  await app.register(dropshipCronRoutes);
  await app.register(automationCronRoutes);
  await app.register(usageCronRoutes);
  await app.register(siteAnalyticsCronRoutes);
  await app.register(funnelsCronRoutes);
  await app.register(seoCronRoutes);
  await app.register(inventoryCronRoutes);
  await app.register(financeCronRoutes);
  await app.register(staffCronRoutes);
  await app.register(channelsCronRoutes);
  await app.register(marketCronRoutes);
  await app.register(acquisitionReportRoutes);
  await app.register(furnishTenantRoutes);
  await app.register(internalPartnerRoutes);
  await app.register(operatorInternalRoutes);
  await app.register(operatorBillingRoutes);
  await app.register(operatorDomainsRoutes);
  await app.register(operatorSupportRoutes);
  await app.register(operatorFeedbackRoutes);
  await app.register(operatorTenantRoutes);
  await app.register(operatorPartnerRoutes);
  await app.register(operatorUserRoutes);
  await app.register(operatorSiteRoutes);
  await app.register(operatorAnnouncementRoutes);

  // v1 surface. Each route file owns its own URL prefix so this central
  // map is easy to skim. Adding a new route group is a one-line registration.
  await app.register(contentTypeRoutes);
  await app.register(entryRoutes);
  await app.register(publishRoutes);
  await app.register(revisionRoutes);
  await app.register(previewTokenRoutes);
  await app.register(contentReportRoutes);
  await app.register(contentAnalyticsRoutes);
  await app.register(navigationRoutes);
  await app.register(redirectRoutes);
  await app.register(authorRoutes);
  await app.register(taxonomyRoutes);
  await app.register(webhookRoutes);
  await app.register(webhookDeliveryRoutes);
  await app.register(stripeBillingWebhookRoutes);
  await app.register(providerWebhookRoutes);
  await app.register(paymentWebhookRoutes);
  await app.register(channelWebhookRoutes);
  await app.register(socialMetaCallbackRoutes);
  await app.register(sitemapRoutes);
  await app.register(rssRoutes);
  await app.register(publicContentRoutes);
  await app.register(publicCommerceRoutes);
  await app.register(publicSearchRoutes);
  await app.register(publicCartRoutes);
  await app.register(publicCheckoutRoutes);
  await app.register(publicMarketRoutes);
  await app.register(publicReviewRoutes);
  await app.register(publicAccountRoutes);
  await app.register(publicPaymentMethodRoutes);
  await app.register(publicReturnsAccountRoutes);
  await app.register(publicAuthRoutes);
  await app.register(publicB2bPortalRoutes);
  await app.register(publicEstimateRoutes);
  await app.register(publicSchedulingRoutes);
  // E-sign + meeting links (docs/144 §12) — unauthenticated, tenant by site slug.
  await app.register(publicDocumentRoutes);
  await app.register(schedulingAccountRoutes);
  // The same booking, reached by the signed link in a confirmation email rather
  // than by signing in — the guest who booked has no account (issue 153).
  await app.register(schedulingManageRoutes);
  await app.register(crmRequestRoutes);
  await app.register(schedulingCalendarRoutes);
  await app.register(schedulingCalendarPushRoutes);
  await app.register(crmCallStatusRoutes);
  await app.register(publicSiteSnapshotRoutes);
  await app.register(publicSiteRoutes);
  await app.register(publicSiteInfoRoutes);
  await app.register(publicBuilderRoutes);
  await app.register(publicMediaRoutes);
  await app.register(publicMediaUploadRoutes);
  await app.register(marketplaceMediaRoutes);
  await app.register(publicConsentRoutes);
  await app.register(publicSignupRoutes);
  await app.register(publicNewsletterRoutes);
  await app.register(publicToolsRoutes);
  await app.register(publicCareersRoutes);
  await app.register(publicFormsRoutes);
  await app.register(publicFormsUploadRoutes);
  await app.register(publicDeliverRoutes);
  await app.register(publicSmsInboundRoutes);
  await app.register(publicSiteAnalyticsRoutes);
  await app.register(publicMarketplaceRoutes);
  await app.register(publicPartnerRoutes);
  await app.register(publicBootcampRoutes);
  await app.register(publicAnnouncementRoutes);
  await app.register(partnerRoutes);
  await app.register(partnerBootcampRoutes);
  await app.register(tenantPartnerRoutes);
  await app.register(publicChatRoutes);
  await app.register(publicRedirectRoutes);
  await app.register(emailWebhookRoutes);
  await app.register(emailUnsubscribeRoutes);
  await app.register(uploadRoutes);
  await app.register(mediaAssetRoutes);
  await app.register(mediaCollectionRoutes);
  await app.register(crmRoutes);
  // Shared order root — gated on Commerce OR B2B OR CRM, not owned by any of
  // them. Registered alongside the modules rather than inside one.
  await app.register(orderRoutes);
  await app.register(invoicingRoutes);
  await app.register(financeRoutes);
  await app.register(staffRoutes);
  await app.register(funnelRoutes);
  await app.register(b2bRoutes);
  await app.register(chatRoutes);
  await app.register(pushRoutes);
  await app.register(sitebuilderRoutes);
  await app.register(builderRoutes);
  await app.register(analyticsRoutes);
  await app.register(formsRoutes);
  await app.register(commerceRoutes);
  await app.register(presetRoutes);
  // Platform list persistence — a named snapshot of a list's query params, for
  // any list in any app (docs/146 Phase 10.2). CRM keeps its own; everything
  // else shares this.
  await app.register(savedViewRoutes);
  await app.register(industryStarterRoutes);
  await app.register(sampleDataRoutes);
  await app.register(dropshipRoutes);
  await app.register(inventoryRoutes);
  await app.register(channelRoutes);
  await app.register(socialRoutes);
  await app.register(integrationRoutes);
  await app.register(marketRoutes);
  await app.register(schedulingRoutes);
  await app.register(tenantRoutes);
  await app.register(tenantBusinessRoutes);
  await app.register(billingRoutes);
  await app.register(usageRoutes);
  await app.register(brandRoutes);
  await app.register(propertiesRoutes);
  await app.register(blueprintRoutes);
  await app.register(marketplaceRoutes);
  await app.register(domainsRoutes);
  await app.register(legalRoutes);
  await app.register(meRoutes);
  await app.register(feedbackRoutes);
  await app.register(userRoutes);
  await app.register(teamRoutes);
  await app.register(emailTestRoutes);
  await app.register(emailRoutes);
  await app.register(dashboardRoutes);
  await app.register(jobsRoutes);
  await app.register(migrationRoutes);
  await app.register(activityRoutes);
  await app.register(notificationRoutes);
  await app.register(notificationPreferenceRoutes);
  await app.register(searchRoutes);
  await app.register(seoAuditRoutes);
  await app.register(seoReportRoutes);
  await app.register(searchConsoleRoutes);
  await app.register(organicRoutes);
  await app.register(aiReportRoutes);
  await app.register(aiPromptTemplateRoutes);
  await app.register(aiToolPolicyRoutes);
  await app.register(aiCredentialRoutes);
  await app.register(aiApiKeyRoutes);
  await app.register(aiMcpConnectionRoutes);
  await app.register(automationRoutes);
  await app.register(platformRoutes);

  return app;
}
