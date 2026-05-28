// Atomic email components + brand tokens. Templates compose these inside
// <EmailLayout>; the contract is that no template inlines raw style props —
// extend a component here instead.

export { EmailWordmark, type EmailWordmarkProps } from './wordmark';
export {
  EmailHeading,
  EmailParagraph,
  EmailMuted,
  EmailLink,
  EmailButton,
  EmailCallout,
  EmailSpacer,
  EmailDivider,
  type EmailHeadingProps,
  type EmailParagraphProps,
  type EmailMutedProps,
  type EmailLinkProps,
  type EmailButtonProps,
  type EmailCalloutProps,
  type EmailSpacerProps,
} from './primitives';
export { colors, typography, spacing, radius, fontFamily } from './tokens';
