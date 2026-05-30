import { z } from 'zod';
import { OptionalUuid } from '../common';
import type { SectionField } from '../fields';

export const TestimonialItem = z.object({
  quote: z.string().max(600).default(''),
  authorName: z.string().max(120).default(''),
  authorTitle: z.string().max(120).default(''),
  avatarMediaId: OptionalUuid,
  rating: z.number().int().min(1).max(5).optional(),
});
export type TestimonialItem = z.infer<typeof TestimonialItem>;

export const TestimonialsConfig = z.object({
  heading: z.string().max(120).default('What customers say'),
  items: z.array(TestimonialItem).max(12).default([]),
  columns: z.number().int().min(1).max(3).default(3),
});
export type TestimonialsConfig = z.infer<typeof TestimonialsConfig>;

export const testimonialsFields: SectionField[] = [
  { key: 'heading', label: 'Heading', type: 'text' },
  {
    key: 'items',
    label: 'Testimonials',
    type: 'list',
    itemLabel: 'Testimonial',
    itemFields: [
      { key: 'quote', label: 'Quote', type: 'textarea' },
      { key: 'authorName', label: 'Author', type: 'text' },
      { key: 'authorTitle', label: 'Title / company', type: 'text' },
      { key: 'avatarMediaId', label: 'Avatar', type: 'media' },
      { key: 'rating', label: 'Rating (1–5)', type: 'number', min: 1, max: 5, step: 1 },
    ],
  },
  { key: 'columns', label: 'Columns', type: 'range', min: 1, max: 3, step: 1 },
];
