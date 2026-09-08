import * as React from 'react';
import { render } from '@react-email/render';
import { getEmailProvider } from './providers';
import { BrandProvider, platformNameOf, type BrandTokens } from './components';
import { EmailLayout } from './templates/_layout';
import type { DeliveryResult, SendableEmail } from './types';
import {
  PasswordResetEmail,
  passwordResetSubject,
  type PasswordResetEmailProps,
} from './templates/password-reset';
import {
  WelcomeMerchantEmail,
  welcomeMerchantSubject,
  type WelcomeMerchantEmailProps,
} from './templates/welcome-merchant';
import {
  PartnerWelcomeEmail,
  partnerWelcomeSubject,
  type PartnerWelcomeEmailProps,
} from './templates/partner-welcome';
import {
  EmailVerificationEmail,
  emailVerificationSubject,
  type EmailVerificationEmailProps,
} from './templates/email-verification';
import { MagicLinkEmail, magicLinkSubject, type MagicLinkEmailProps } from './templates/magic-link';
import { LoginOtpEmail, loginOtpSubject, type LoginOtpEmailProps } from './templates/login-otp';
import {
  DomainRenewalReminderEmail,
  domainRenewalReminderSubject,
  type DomainRenewalReminderEmailProps,
} from './templates/domain-renewal-reminder';
import {
  ChatNotificationEmail,
  chatNotificationSubject,
  type ChatNotificationEmailProps,
} from './templates/chat-notification';
import {
  SocialPostFailedEmail,
  socialPostFailedSubject,
  type SocialPostFailedEmailProps,
} from './templates/social-post-failed';
import {
  SocialConnectionExpiredEmail,
  socialConnectionExpiredSubject,
  type SocialConnectionExpiredEmailProps,
} from './templates/social-connection-expired';
import {
  InventoryReportEmail,
  inventoryReportSubject,
  type InventoryReportEmailProps,
} from './templates/inventory-report';
import {
  MarketSettlementReportEmail,
  marketSettlementReportSubject,
  type MarketSettlementReportEmailProps,
} from './templates/market-settlement-report';
import {
  FeedbackResponseEmail,
  feedbackResponseSubject,
  type FeedbackResponseEmailProps,
} from './templates/feedback-response';
import {
  JobApplicationReceivedEmail,
  jobApplicationReceivedSubject,
  type JobApplicationReceivedEmailProps,
} from './templates/job-application-received';
import {
  JobApplicationConfirmationEmail,
  jobApplicationConfirmationSubject,
  type JobApplicationConfirmationEmailProps,
} from './templates/job-application-confirmation';
import {
  TeamInvitationEmail,
  teamInvitationSubject,
  type TeamInvitationEmailProps,
} from './templates/team-invitation';
import {
  FormSubmissionNotificationEmail,
  formSubmissionNotificationSubject,
  type FormSubmissionNotificationEmailProps,
} from './templates/form-submission-notification';
import {
  FormSubmissionConfirmationEmail,
  formSubmissionConfirmationSubject,
  type FormSubmissionConfirmationEmailProps,
} from './templates/form-submission-confirmation';
import {
  GatedDeliveryEmail,
  gatedDeliverySubject,
  type GatedDeliveryEmailProps,
} from './templates/gated-delivery';
import {
  ToolResultEmail,
  toolResultSubject,
  type ToolResultEmailProps,
} from './templates/tool-result';
import {
  BillingReceiptEmail,
  billingReceiptSubject,
  type BillingReceiptEmailProps,
} from './templates/billing-receipt';
import {
  BillingPaymentFailedEmail,
  billingPaymentFailedSubject,
  type BillingPaymentFailedEmailProps,
} from './templates/billing-payment-failed';
import {
  BillingTrialEndingEmail,
  billingTrialEndingSubject,
  type BillingTrialEndingEmailProps,
} from './templates/billing-trial-ending';
import {
  SubscriptionUpdateEmail,
  subscriptionUpdateSubject,
  type SubscriptionUpdateEmailProps,
} from './templates/subscription-update';
import {
  DomainLiveEmail,
  domainLiveSubject,
  type DomainLiveEmailProps,
} from './templates/domain-live';
import {
  DomainExpiredEmail,
  domainExpiredSubject,
  type DomainExpiredEmailProps,
} from './templates/domain-expired';
import {
  EmailDomainVerifiedEmail,
  emailDomainVerifiedSubject,
  type EmailDomainVerifiedEmailProps,
} from './templates/email-domain-verified';
import {
  DocumentSignatureRequestEmail,
  documentSignatureRequestSubject,
  type DocumentSignatureRequestEmailProps,
} from './templates/document-signature-request';
import {
  InvoiceSentEmail,
  invoiceSentSubject,
  type InvoiceSentEmailProps,
} from './templates/invoice-sent';
import {
  InvitationAcceptedEmail,
  invitationAcceptedSubject,
  type InvitationAcceptedEmailProps,
} from './templates/invitation-accepted';
import {
  TeamMemberRemovedEmail,
  teamMemberRemovedSubject,
  type TeamMemberRemovedEmailProps,
} from './templates/team-member-removed';
import {
  TeamRoleChangedEmail,
  teamRoleChangedSubject,
  type TeamRoleChangedEmailProps,
} from './templates/team-role-changed';
import {
  ModuleToggleEmail,
  moduleToggleSubject,
  type ModuleToggleEmailProps,
} from './templates/module-toggle';
import {
  PartnerApplicationReceivedEmail,
  partnerApplicationReceivedSubject,
  type PartnerApplicationReceivedEmailProps,
} from './templates/partner-application-received';
import {
  PartnerEarningsEmail,
  partnerEarningsSubject,
  type PartnerEarningsEmailProps,
} from './templates/partner-earnings';
import {
  PasswordChangedEmail,
  passwordChangedSubject,
  type PasswordChangedEmailProps,
} from './templates/password-changed';
import {
  TwoFactorChangedEmail,
  twoFactorChangedSubject,
  type TwoFactorChangedEmailProps,
} from './templates/two-factor-changed';
import {
  NewDeviceSigninEmail,
  newDeviceSigninSubject,
  type NewDeviceSigninEmailProps,
} from './templates/new-device-signin';
import {
  FeedbackReceivedEmail,
  feedbackReceivedSubject,
  type FeedbackReceivedEmailProps,
} from './templates/feedback-received';

// Template registry + dispatcher. Two surfaces:
//
//   renderTemplate(input)  — pure render → returns SendableEmail. Used by
//                            email-worker, which then hands the result to
//                            getEmailProvider().send().
//
//   sendTemplate(input)    — render + provider.send. Direct-send escape
//                            hatch for synchronous-required flows (OTP).
//                            New emails MUST publish 'email.send' to
//                            Pub/Sub instead — see CLAUDE.md.

const DEFAULT_FROM_ENV = 'SPARX_EMAIL_FROM';
const FALLBACK_FROM = 'sparx <noreply@sparx.email>';

/** `override` is the SENDING BRAND's From, which the caller resolves because only
 *  it knows the tenant. Absent → the platform-wide address, which names one
 *  brand and is right for exactly that brand's mail. */
function defaultFrom(override?: string): string {
  return override ?? process.env[DEFAULT_FROM_ENV] ?? FALLBACK_FROM;
}

// Platform + auth/operational templates only (docs/93). Tenant→customer emails
// (order/shipping/appointment confirmations) are Builder-authored node-trees,
// rendered by key at dispatch — not coded React Email components.
export type TemplateId =
  | 'password-reset'
  | 'welcome-merchant'
  | 'partner-welcome'
  | 'email-verification'
  | 'magic-link'
  | 'login-otp'
  | 'domain-renewal-reminder'
  | 'chat-notification'
  | 'market-settlement-report'
  | 'feedback-response'
  | 'job-application-received'
  | 'job-application-confirmation'
  | 'team-invitation'
  | 'form-submission-notification'
  | 'form-submission-confirmation'
  | 'gated-delivery'
  // The free-tool result a visitor asked us to send them (docs/152 A3).
  | 'tool-result'
  | 'billing-receipt'
  | 'billing-payment-failed'
  | 'billing-trial-ending'
  // One email for every subscription STATE change (started/canceled/plan-changed/
  // paused/resumed), published from the Stripe billing webhook.
  | 'subscription-update'
  // Domain lifecycle (published from domain-worker + the email-domains verify route).
  | 'domain-live'
  | 'domain-expired'
  | 'email-domain-verified'
  // A tenant→customer document signing request (published from signature-mail.ts).
  | 'document-signature-request'
  | 'invoice-sent'
  // Team / org membership.
  | 'invitation-accepted'
  | 'team-member-removed'
  | 'team-role-changed'
  // A module was turned on/off (billing implication → confirm to the owner).
  | 'module-toggle'
  // Partner program.
  | 'partner-application-received'
  | 'partner-earnings'
  // Account security.
  | 'password-changed'
  | 'two-factor-changed'
  | 'new-device-signin'
  // "We got your feedback" acknowledgement.
  | 'feedback-received'
  // The social module's two "something needs you" emails (docs/social-audit GAPs 1+2).
  | 'social-post-failed'
  | 'social-connection-expired'
  // A scheduled inventory report (docs/146 Phase 10.4) — the figures in the
  // body, the spreadsheet attached.
  | 'inventory-report';

// The same set as a VALUE lives in `./template-ids` — a JSX-free module, so a
// backend can ask "what templates exist" without loading React. Re-exported
// here because this is where callers look for it.
export { TEMPLATE_IDS } from './template-ids';

export type TemplateSend =
  | {
      template: 'password-reset';
      to: string;
      props: PasswordResetEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'welcome-merchant';
      to: string;
      props: WelcomeMerchantEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'partner-welcome';
      to: string;
      props: PartnerWelcomeEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'email-verification';
      to: string;
      props: EmailVerificationEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'magic-link';
      to: string;
      props: MagicLinkEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'login-otp';
      to: string;
      props: LoginOtpEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'domain-renewal-reminder';
      to: string;
      props: DomainRenewalReminderEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'chat-notification';
      to: string;
      props: ChatNotificationEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'market-settlement-report';
      to: string;
      props: MarketSettlementReportEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'feedback-response';
      to: string;
      props: FeedbackResponseEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'job-application-received';
      to: string;
      props: JobApplicationReceivedEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'job-application-confirmation';
      to: string;
      props: JobApplicationConfirmationEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'team-invitation';
      to: string;
      props: TeamInvitationEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'form-submission-notification';
      to: string;
      props: FormSubmissionNotificationEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'gated-delivery';
      to: string;
      props: GatedDeliveryEmailProps & { subject?: string | null };
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'form-submission-confirmation';
      to: string;
      props: FormSubmissionConfirmationEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'tool-result';
      to: string;
      props: ToolResultEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'billing-receipt';
      to: string;
      props: BillingReceiptEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'billing-payment-failed';
      to: string;
      props: BillingPaymentFailedEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'billing-trial-ending';
      to: string;
      props: BillingTrialEndingEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'subscription-update';
      to: string;
      props: SubscriptionUpdateEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'domain-live';
      to: string;
      props: DomainLiveEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'domain-expired';
      to: string;
      props: DomainExpiredEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'email-domain-verified';
      to: string;
      props: EmailDomainVerifiedEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'document-signature-request';
      to: string;
      props: DocumentSignatureRequestEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'invoice-sent';
      to: string;
      props: InvoiceSentEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'invitation-accepted';
      to: string;
      props: InvitationAcceptedEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'team-member-removed';
      to: string;
      props: TeamMemberRemovedEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'team-role-changed';
      to: string;
      props: TeamRoleChangedEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'module-toggle';
      to: string;
      props: ModuleToggleEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'partner-application-received';
      to: string;
      props: PartnerApplicationReceivedEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'partner-earnings';
      to: string;
      props: PartnerEarningsEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'password-changed';
      to: string;
      props: PasswordChangedEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'two-factor-changed';
      to: string;
      props: TwoFactorChangedEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'new-device-signin';
      to: string;
      props: NewDeviceSigninEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'feedback-received';
      to: string;
      props: FeedbackReceivedEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'social-post-failed';
      to: string;
      props: SocialPostFailedEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'social-connection-expired';
      to: string;
      props: SocialConnectionExpiredEmailProps;
      from?: string;
      replyTo?: string;
    }
  | {
      template: 'inventory-report';
      to: string;
      props: InventoryReportEmailProps;
      from?: string;
      replyTo?: string;
    };

/**
 * Render a typed template to a SendableEmail (subject + html + auto-generated
 * plain text). Used by email-worker to render after pulling an `email.send`
 * Pub/Sub message; also used internally by sendTemplate().
 *
 * Plain text is generated by React Email's `render(..., { plainText: true })`
 * — never hand-write a separate text version, it just drifts from the HTML.
 */
export interface RenderTemplateOptions {
  /** Per-tenant brand. When omitted, the sparx defaults render. Platform
   *  emails (OTP/2FA, system) intentionally pass no brand. */
  brand?: Partial<BrandTokens>;
  /**
   * The `From` for this send when the caller does not name one — the SENDING
   * brand's, resolved by whoever knows the tenant (`platformFrom` in
   * `@wizeworks/brand-core`).
   *
   * Omitted, the platform-wide `SPARX_EMAIL_FROM` applies, which puts one
   * brand's name in a second brand's customer's inbox. An explicit `input.from`
   * still wins over both.
   */
  from?: string;
}

export async function renderTemplate(
  input: TemplateSend,
  opts: RenderTemplateOptions = {}
): Promise<SendableEmail> {
  // Wrap the template in the brand provider so every atom (via context) picks
  // up the tenant's colors/fonts/logo without per-template prop threading.
  const wrap = (node: React.ReactElement) => (
    <BrandProvider brand={opts.brand}>{node}</BrandProvider>
  );

  // Subjects are strings, not components, so they cannot read the context the
  // body reads — this is the same value, resolved once for the ones that name
  // the product. Every one of them said "sparx" regardless of who was sending.
  const platform = platformNameOf(opts.brand);

  switch (input.template) {
    case 'password-reset': {
      const element = wrap(<PasswordResetEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: passwordResetSubject(platform),
        html,
        text,
        templateId: 'password-reset',
      };
    }
    case 'welcome-merchant': {
      const element = wrap(<WelcomeMerchantEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: welcomeMerchantSubject(platform),
        html,
        text,
        templateId: 'welcome-merchant',
      };
    }
    case 'partner-welcome': {
      const element = wrap(<PartnerWelcomeEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: partnerWelcomeSubject(platform),
        html,
        text,
        templateId: 'partner-welcome',
      };
    }
    case 'email-verification': {
      const element = wrap(<EmailVerificationEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: emailVerificationSubject(platform),
        html,
        text,
        templateId: 'email-verification',
      };
    }
    case 'magic-link': {
      const element = wrap(<MagicLinkEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: magicLinkSubject(platform),
        html,
        text,
        templateId: 'magic-link',
      };
    }
    case 'login-otp': {
      const element = wrap(<LoginOtpEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: loginOtpSubject(platform),
        html,
        text,
        templateId: 'login-otp',
      };
    }
    case 'domain-renewal-reminder': {
      const element = wrap(<DomainRenewalReminderEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: domainRenewalReminderSubject(input.props.domainName, input.props.daysUntilExpiry),
        html,
        text,
        templateId: 'domain-renewal-reminder',
      };
    }
    case 'chat-notification': {
      const element = wrap(<ChatNotificationEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: chatNotificationSubject(input.props.customerName),
        html,
        text,
        templateId: 'chat-notification',
      };
    }
    case 'market-settlement-report': {
      const element = wrap(<MarketSettlementReportEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: marketSettlementReportSubject(input.props.periodLabel),
        html,
        text,
        templateId: 'market-settlement-report',
      };
    }
    case 'feedback-response': {
      const element = wrap(<FeedbackResponseEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: feedbackResponseSubject(input.props.feedbackTitle),
        html,
        text,
        templateId: 'feedback-response',
      };
    }
    case 'job-application-received': {
      const element = wrap(<JobApplicationReceivedEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: jobApplicationReceivedSubject(input.props.roleTitle),
        html,
        text,
        templateId: 'job-application-received',
      };
    }
    case 'job-application-confirmation': {
      const element = wrap(<JobApplicationConfirmationEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: jobApplicationConfirmationSubject(input.props.roleTitle),
        html,
        text,
        templateId: 'job-application-confirmation',
      };
    }
    case 'team-invitation': {
      const element = wrap(<TeamInvitationEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: teamInvitationSubject(input.props.orgName, platform),
        html,
        text,
        templateId: 'team-invitation',
      };
    }
    case 'form-submission-notification': {
      const element = wrap(<FormSubmissionNotificationEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: formSubmissionNotificationSubject(input.props.formName),
        html,
        text,
        templateId: 'form-submission-notification',
      };
    }
    case 'form-submission-confirmation': {
      const element = wrap(<FormSubmissionConfirmationEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: formSubmissionConfirmationSubject(input.props.subject),
        html,
        text,
        templateId: 'form-submission-confirmation',
      };
    }
    case 'gated-delivery': {
      const element = wrap(<GatedDeliveryEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: gatedDeliverySubject(input.props.subject),
        html,
        text,
        templateId: 'gated-delivery',
      };
    }
    case 'tool-result': {
      const element = wrap(<ToolResultEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: toolResultSubject(input.props.toolName),
        html,
        text,
        templateId: 'tool-result',
      };
    }
    case 'billing-receipt': {
      const element = wrap(<BillingReceiptEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: billingReceiptSubject(platform),
        html,
        text,
        templateId: 'billing-receipt',
      };
    }
    case 'billing-payment-failed': {
      const element = wrap(<BillingPaymentFailedEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: billingPaymentFailedSubject(platform),
        html,
        text,
        templateId: 'billing-payment-failed',
      };
    }
    case 'billing-trial-ending': {
      const element = wrap(<BillingTrialEndingEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: billingTrialEndingSubject(platform),
        html,
        text,
        templateId: 'billing-trial-ending',
      };
    }
    case 'subscription-update': {
      const element = wrap(<SubscriptionUpdateEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: subscriptionUpdateSubject(input.props.kind, input.props.planLabel, platform),
        html,
        text,
        templateId: 'subscription-update',
      };
    }
    case 'domain-live': {
      const element = wrap(<DomainLiveEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: domainLiveSubject(input.props.domainName),
        html,
        text,
        templateId: 'domain-live',
      };
    }
    case 'domain-expired': {
      const element = wrap(<DomainExpiredEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: domainExpiredSubject(input.props.domainName),
        html,
        text,
        templateId: 'domain-expired',
      };
    }
    case 'email-domain-verified': {
      const element = wrap(<EmailDomainVerifiedEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: emailDomainVerifiedSubject(input.props.domainName),
        html,
        text,
        templateId: 'email-domain-verified',
      };
    }
    case 'document-signature-request': {
      const element = wrap(<DocumentSignatureRequestEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: documentSignatureRequestSubject(
          input.props.documentLabel,
          input.props.documentNumber,
          input.props.fromName
        ),
        html,
        text,
        templateId: 'document-signature-request',
      };
    }
    case 'invoice-sent': {
      const element = wrap(<InvoiceSentEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: invoiceSentSubject(
          input.props.documentLabel,
          input.props.documentNumber,
          input.props.fromName
        ),
        html,
        text,
        templateId: 'invoice-sent',
      };
    }
    case 'invitation-accepted': {
      const element = wrap(<InvitationAcceptedEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: invitationAcceptedSubject(
          input.props.inviteeName ?? input.props.inviteeEmail,
          platform
        ),
        html,
        text,
        templateId: 'invitation-accepted',
      };
    }
    case 'team-member-removed': {
      const element = wrap(<TeamMemberRemovedEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: teamMemberRemovedSubject(input.props.orgName),
        html,
        text,
        templateId: 'team-member-removed',
      };
    }
    case 'team-role-changed': {
      const element = wrap(<TeamRoleChangedEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: teamRoleChangedSubject(input.props.orgName),
        html,
        text,
        templateId: 'team-role-changed',
      };
    }
    case 'module-toggle': {
      const element = wrap(<ModuleToggleEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: moduleToggleSubject(input.props.enabled, input.props.moduleName),
        html,
        text,
        templateId: 'module-toggle',
      };
    }
    case 'partner-application-received': {
      const element = wrap(<PartnerApplicationReceivedEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: partnerApplicationReceivedSubject(input.props.applicantName),
        html,
        text,
        templateId: 'partner-application-received',
      };
    }
    case 'partner-earnings': {
      const element = wrap(<PartnerEarningsEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: partnerEarningsSubject(input.props.kind, platform, input.props.amountLabel),
        html,
        text,
        templateId: 'partner-earnings',
      };
    }
    case 'password-changed': {
      const element = wrap(<PasswordChangedEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: passwordChangedSubject(platform),
        html,
        text,
        templateId: 'password-changed',
      };
    }
    case 'two-factor-changed': {
      const element = wrap(<TwoFactorChangedEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: twoFactorChangedSubject(input.props.enabled, platform),
        html,
        text,
        templateId: 'two-factor-changed',
      };
    }
    case 'new-device-signin': {
      const element = wrap(<NewDeviceSigninEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: newDeviceSigninSubject(platform),
        html,
        text,
        templateId: 'new-device-signin',
      };
    }
    case 'feedback-received': {
      const element = wrap(<FeedbackReceivedEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: feedbackReceivedSubject(input.props.feedbackTitle),
        html,
        text,
        templateId: 'feedback-received',
      };
    }
    case 'social-post-failed': {
      const element = wrap(<SocialPostFailedEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: socialPostFailedSubject(
          input.props.excerpt,
          (input.props.succeeded?.length ?? 0) > 0
        ),
        html,
        text,
        templateId: 'social-post-failed',
      };
    }
    case 'social-connection-expired': {
      const element = wrap(<SocialConnectionExpiredEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: socialConnectionExpiredSubject(input.props.platformName),
        html,
        text,
        templateId: 'social-connection-expired',
      };
    }
    case 'inventory-report': {
      const element = wrap(<InventoryReportEmail {...input.props} />);
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      return {
        from: input.from ?? defaultFrom(opts.from),
        to: input.to,
        replyTo: input.replyTo,
        subject: inventoryReportSubject(input.props.scheduleName, input.props.periodLabel),
        html,
        text,
        templateId: 'inventory-report',
      };
    }
  }
}

/**
 * Direct send. Renders the template and immediately hands it to the provider
 * (console in dev, Postal in prod).
 *
 * @deprecated for general use — publish an `email.send` Pub/Sub event so
 * email-worker handles delivery, retries, and audit. This direct path
 * remains for synchronous-required flows only (OTP codes, future 2FA).
 * Adding a new caller? See CLAUDE.md → "Outbound email".
 */
export async function sendTemplate(input: TemplateSend): Promise<DeliveryResult> {
  const rendered = await renderTemplate(input);
  return sendEmail(rendered);
}

/**
 * Hand-rolled SendableEmail → provider escape hatch. Same direct-send
 * caveat as sendTemplate.
 *
 * @deprecated for general use — see sendTemplate doc.
 */
export async function sendEmail(email: SendableEmail): Promise<DeliveryResult> {
  return getEmailProvider().send(email);
}

export interface AuthoredEmailInput {
  to: string;
  subject: string;
  /** Sanitized HTML body (e.g. from @wizeworks/cms-editor's renderDocToHtml). */
  bodyHtml: string;
  preheader?: string;
  from?: string;
  replyTo?: string;
}

/**
 * Render a tenant-AUTHORED marketing email: the brand chrome (header/footer/
 * background from BrandTokens) wrapping sanitized prose HTML. The body HTML is
 * injected verbatim — callers MUST pass already-sanitized HTML (the CMS
 * serializer whitelists tags/URLs). Used by broadcasts + authored templates.
 *
 * Until the shared section-composition system lands (plan P9), the body is a
 * single rich-text region; section blocks layer on later without changing this
 * signature.
 */
export async function renderAuthoredEmail(
  input: AuthoredEmailInput,
  opts: RenderTemplateOptions = {}
): Promise<SendableEmail> {
  const element = (
    <BrandProvider brand={opts.brand}>
      {/* A tenant writing to their OWN mailing list -- the largest visitor-facing
          surface in the product. It carried our wordmark over the shop's
          newsletter and our operating company under it, to readers who had never
          heard of us. */}
      <EmailLayout audience="visitor" preview={input.preheader ?? input.subject}>
        <div dangerouslySetInnerHTML={{ __html: input.bodyHtml }} />
      </EmailLayout>
    </BrandProvider>
  );
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return {
    from: input.from ?? defaultFrom(),
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    html,
    text,
  };
}

export { renderTemplate as _renderTemplateForTest };
