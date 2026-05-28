import * as React from 'react';
import { render } from '@react-email/render';
import { getEmailProvider } from './providers';
import type { DeliveryResult, SendableEmail } from './types';
import {
  PasswordResetEmail,
  passwordResetSubject,
  passwordResetText,
  type PasswordResetEmailProps,
} from './templates/password-reset';
import {
  WelcomeMerchantEmail,
  welcomeMerchantSubject,
  welcomeMerchantText,
  type WelcomeMerchantEmailProps,
} from './templates/welcome-merchant';

// High-level sender. Every caller picks a template (typed input) or, if they
// really need to, hands us a fully rendered SendableEmail directly. Defaults
// for `from` come from SPARX_EMAIL_FROM so callers don't repeat noreply@... on
// every send.

const DEFAULT_FROM_ENV = 'SPARX_EMAIL_FROM';
const FALLBACK_FROM = 'Sparx <noreply@sparx.email>';

function defaultFrom(): string {
  return process.env[DEFAULT_FROM_ENV] ?? FALLBACK_FROM;
}

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
    };

export async function sendTemplate(input: TemplateSend): Promise<DeliveryResult> {
  const rendered = await renderTemplate(input);
  return sendEmail(rendered);
}

async function renderTemplate(input: TemplateSend): Promise<SendableEmail> {
  switch (input.template) {
    case 'password-reset': {
      const html = await render(<PasswordResetEmail {...input.props} />);
      return {
        from: input.from ?? defaultFrom(),
        to: input.to,
        replyTo: input.replyTo,
        subject: passwordResetSubject,
        html,
        text: passwordResetText(input.props),
        templateId: 'password-reset',
      };
    }
    case 'welcome-merchant': {
      const html = await render(<WelcomeMerchantEmail {...input.props} />);
      return {
        from: input.from ?? defaultFrom(),
        to: input.to,
        replyTo: input.replyTo,
        subject: welcomeMerchantSubject,
        html,
        text: welcomeMerchantText(input.props),
        templateId: 'welcome-merchant',
      };
    }
  }
}

export async function sendEmail(email: SendableEmail): Promise<DeliveryResult> {
  return getEmailProvider().send(email);
}

export { renderTemplate as _renderTemplateForTest };
