export type { SendableEmail, DeliveryResult, EmailProvider } from './types';
export {
  consoleProvider,
  lastConsoleSend,
  resetConsoleProvider,
  createPostalProvider,
  getEmailProvider,
  _setEmailProvider,
  type ConsoleSend,
} from './providers';
export { sendEmail, sendTemplate, _renderTemplateForTest, type TemplateSend } from './send';
export {
  PasswordResetEmail,
  WelcomeMerchantEmail,
  type PasswordResetEmailProps,
  type WelcomeMerchantEmailProps,
} from './templates';
