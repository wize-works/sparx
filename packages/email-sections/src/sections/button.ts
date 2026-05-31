import { z } from 'zod';
import { Align, LinkUrl } from '../common';
import type { SectionField } from '../fields';

export const ButtonConfig = z.object({
  label: z.string().max(80).default('Shop now'),
  href: LinkUrl.default(''),
  align: Align.default('center'),
});
export type ButtonConfig = z.infer<typeof ButtonConfig>;

export const buttonFields: SectionField[] = [
  { key: 'label', label: 'Button label', type: 'text' },
  { key: 'href', label: 'Links to', type: 'url', placeholder: 'https://…' },
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
