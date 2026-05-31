import { z } from 'zod';
import type { SectionField } from '../fields';

export const DividerConfig = z.object({
  spacing: z.enum(['sm', 'md', 'lg']).default('md'),
  line: z.boolean().default(true),
});
export type DividerConfig = z.infer<typeof DividerConfig>;

export const dividerFields: SectionField[] = [
  {
    key: 'spacing',
    label: 'Spacing',
    type: 'select',
    options: [
      { label: 'Small', value: 'sm' },
      { label: 'Medium', value: 'md' },
      { label: 'Large', value: 'lg' },
    ],
  },
  { key: 'line', label: 'Show divider line', type: 'boolean' },
];
