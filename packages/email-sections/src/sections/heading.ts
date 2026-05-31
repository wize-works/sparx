import { z } from 'zod';
import { Align } from '../common';
import type { SectionField } from '../fields';

export const HeadingConfig = z.object({
  text: z.string().max(200).default('Heading'),
  level: z.enum(['h1', 'h2']).default('h1'),
  align: Align.default('left'),
});
export type HeadingConfig = z.infer<typeof HeadingConfig>;

export const headingFields: SectionField[] = [
  { key: 'text', label: 'Text', type: 'text' },
  {
    key: 'level',
    label: 'Size',
    type: 'select',
    options: [
      { label: 'Large (H1)', value: 'h1' },
      { label: 'Medium (H2)', value: 'h2' },
    ],
  },
  {
    key: 'align',
    label: 'Alignment',
    type: 'select',
    options: [
      { label: 'Left', value: 'left' },
      { label: 'Center', value: 'center' },
      { label: 'Right', value: 'right' },
    ],
  },
];
