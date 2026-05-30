// @sparx/email — typed templates, render path, and provider.
//
// Two ways callers reach the email pipeline:
//
//   1. (Default) Publish 'email.send' to Pub/Sub. email-worker pulls the
//      event, calls renderTemplate(), and hands the result to the active
//      provider (Mailgun in prod, console in dev/test).
//
//   2. (Escape hatch) Call sendTemplate() directly. Only for OTP / 2FA
//      and other synchronous-required flows — see CLAUDE.md.

export type { SendableEmail, DeliveryResult, EmailProvider } from './types';

export {
  consoleProvider,
  lastConsoleSend,
  resetConsoleProvider,
  createMailgunProvider,
  MailgunParameterError,
  createPostalProvider,
  PostalParameterError,
  getEmailProvider,
  _setEmailProvider,
  type ConsoleSend,
} from './providers';

export {
  renderTemplate,
  renderAuthoredEmail,
  sendEmail,
  sendTemplate,
  _renderTemplateForTest,
  type TemplateId,
  type TemplateSend,
  type RenderTemplateOptions,
  type AuthoredEmailInput,
} from './send';

export {
  PasswordResetEmail,
  WelcomeMerchantEmail,
  EmailLayout,
  type PasswordResetEmailProps,
  type WelcomeMerchantEmailProps,
} from './templates';

// Component primitives + tokens — consumed by templates inside this package;
// also exported so apps building one-off email content (e.g. a CRM export
// summary screen embedded in a notification) can re-use the brand chrome.
export * from './components';

// Mailgun domain-admin control-plane (create / verify / delete sending
// domains). Consumed by @sparx/email-platform's domain-service.
export {
  getMailgunDomainAdmin,
  MailgunAdminError,
  type MailgunDomainAdmin,
  type MailgunDomainResult,
  type MailgunDnsRecord,
} from './admin/mailgun-domains';
