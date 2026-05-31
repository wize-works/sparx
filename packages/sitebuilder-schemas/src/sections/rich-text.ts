import { z } from 'zod';
import { Align } from '../common';
import type { SectionField } from '../fields';

export const RichTextConfig = z.object({
  heading: z.string().max(160).default(''),
  // Sanitized HTML produced by the customizer's rich-text editor.
  html: z
    .string()
    .max(20000)
    .default(
      '<p>Write your story here. Use this space to tell visitors about your brand, your products, or what makes you different.</p>'
    ),
  align: Align.default('left'),
  width: z.enum(['narrow', 'normal']).default('normal'),
});
export type RichTextConfig = z.infer<typeof RichTextConfig>;

export const richTextFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'html', label: 'Content', type: 'richtext' },
  {
    key: 'align',
    label: 'Text alignment',
    type: 'select',
    options: [
      { label: 'Left', value: 'left' },
      { label: 'Center', value: 'center' },
      { label: 'Right', value: 'right' },
    ],
  },
  {
    key: 'width',
    label: 'Width',
    type: 'select',
    options: [
      { label: 'Narrow (readable)', value: 'narrow' },
      { label: 'Normal', value: 'normal' },
    ],
  },
];
