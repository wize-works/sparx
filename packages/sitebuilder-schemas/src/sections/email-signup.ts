import { z } from 'zod';
import type { SectionField } from '../fields';

export const EmailSignupConfig = z.object({
  heading: z.string().max(120).default('Join our newsletter'),
  description: z.string().max(300).default(''),
  placeholder: z.string().max(80).default('Enter your email'),
  buttonLabel: z.string().max(40).default('Subscribe'),
  successMessage: z.string().max(200).default('Thanks for subscribing!'),
});
export type EmailSignupConfig = z.infer<typeof EmailSignupConfig>;

export const emailSignupFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'placeholder', label: 'Input placeholder', type: 'text' },
  { key: 'buttonLabel', label: 'Button label', type: 'text' },
  { key: 'successMessage', label: 'Success message', type: 'text' },
];
