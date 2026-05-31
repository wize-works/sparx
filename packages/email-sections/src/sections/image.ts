import { z } from 'zod';
import { Align, LinkUrl, OptionalUuid } from '../common';
import type { SectionField } from '../fields';

export const ImageConfig = z.object({
  mediaId: OptionalUuid,
  alt: z.string().max(255).default(''),
  href: LinkUrl.default(''),
  width: z.enum(['full', 'inset']).default('full'),
  align: Align.default('center'),
});
export type ImageConfig = z.infer<typeof ImageConfig>;

export const imageFields: SectionField[] = [
  { key: 'mediaId', label: 'Image', type: 'media' },
  { key: 'alt', label: 'Alt text', type: 'text', help: 'Describes the image for screen readers.' },
  { key: 'href', label: 'Links to', type: 'url', placeholder: 'https://…' },
  {
    key: 'width',
    label: 'Width',
    type: 'select',
    options: [
      { label: 'Full width', value: 'full' },
      { label: 'Inset', value: 'inset' },
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
