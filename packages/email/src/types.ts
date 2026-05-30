// Provider-agnostic types for the Sparx email pipeline.
//
// Every transactional or broadcast send goes through a single sendEmail()
// entrypoint; providers receive a rendered SendableEmail (HTML + text + subject)
// and only need to deliver it. Templates render to a SendableEmail via React
// Email — no provider ever sees raw template inputs.

export interface SendableEmail {
  /** Display name + address, or just an address. */
  from: string;
  /** Single recipient — we keep it 1:1 for transactional flows. */
  to: string;
  /** Optional reply-to override. */
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Logical template id (e.g. "password-reset"). Lets providers tag deliveries
   * for reputation isolation + lets the audit log group sends.
   */
  templateId?: string;
  /** Free-form key/value for provider tagging (Postal headers, etc.). */
  tags?: Record<string, string>;
  /**
   * Provider "user variables" echoed back on delivery/engagement webhooks
   * (Mailgun `v:*`). Used for tenant + broadcast/automation attribution so the
   * webhook receiver can write the right EmailEvent / EmailSuppression rows.
   */
  variables?: Record<string, string>;
}

export interface DeliveryResult {
  /** Provider-assigned identifier. */
  id: string;
  /** Friendly provider name — useful for logging + the test-send UI. */
  provider: string;
  /** ISO timestamp when the provider accepted the message. */
  acceptedAt: string;
}

export interface EmailProvider {
  /** Stable identifier surfaced in logs + DeliveryResult. */
  name: string;
  send(email: SendableEmail): Promise<DeliveryResult>;
}
