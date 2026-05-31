import { z } from 'zod';
import { Align, LinkUrl, OptionalUuid } from '../common';
import type { SectionField } from '../fields';

export const ImageBannerConfig = z.object({
  imageMediaId: OptionalUuid,
  heading: z.string().max(160).default('Your banner headline'),
  subheading: z.string().max(300).default(''),
  ctaLabel: z.string().max(60).default('Learn more'),
  ctaUrl: LinkUrl.default('/products'),
  align: Align.default('left'),
  height: z.enum(['sm', 'md', 'lg']).default('md'),
});
export type ImageBannerConfig = z.infer<typeof ImageBannerConfig>;

export const imageBannerFields: SectionField[] = [
  { key: 'imageMediaId', label: 'Image', type: 'media' },
  { key: 'heading', label: 'Heading', type: 'text' },
  { key: 'subheading', label: 'Subheading', type: 'textarea' },
  { key: 'ctaLabel', label: 'Button label', type: 'text' },
  { key: 'ctaUrl', label: 'Button link', type: 'url' },
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
    key: 'height',
    label: 'Height',
    type: 'select',
    options: [
      { label: 'Small', value: 'sm' },
      { label: 'Medium', value: 'md' },
      { label: 'Large', value: 'lg' },
    ],
  },
];
