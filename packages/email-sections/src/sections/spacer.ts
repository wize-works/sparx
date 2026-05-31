import { z } from 'zod';
import type { SectionField } from '../fields';

export const SpacerConfig = z.object({
  size: z.enum(['sm', 'md', 'lg', 'xl']).default('md'),
});
export type SpacerConfig = z.infer<typeof SpacerConfig>;

export const spacerFields: SectionField[] = [
  {
    key: 'size',
    label: 'Height',
    type: 'select',
    options: [
      { label: 'Small', value: 'sm' },
      { label: 'Medium', value: 'md' },
      { label: 'Large', value: 'lg' },
      { label: 'Extra large', value: 'xl' },
    ],
  },
];
