import { z } from 'zod';
import { Align, LinkUrl, OptionalUuid } from '../common';
import type { SectionField } from '../fields';

export const HeroConfig = z.object({
  backgroundMediaId: OptionalUuid,
  heading: z.string().max(160).default(''),
  subheading: z.string().max(400).default(''),
  ctaLabel: z.string().max(60).default(''),
  ctaUrl: LinkUrl.default(''),
  align: Align.default('center'),
  overlayOpacity: z.number().int().min(0).max(100).default(40),
});
export type HeroConfig = z.infer<typeof HeroConfig>;

export const heroFields: SectionField[] = [
  { key: 'backgroundMediaId', label: 'Background image', type: 'media' },
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'subheading', label: 'Subheading', type: 'textarea' },
  { key: 'ctaLabel', label: 'Button label', type: 'text' },
  { key: 'ctaUrl', label: 'Button link', type: 'url', placeholder: '/products' },
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
  { key: 'overlayOpacity', label: 'Overlay opacity', type: 'range', min: 0, max: 100, step: 5 },
];
