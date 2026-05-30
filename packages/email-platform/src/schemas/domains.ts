import { z } from 'zod';

// A sending domain to provision in Mailgun. Lowercased + trimmed; a bare
// hostname (no scheme/path), 1–255 chars, at least one dot.
const HOSTNAME = /^(?=.{1,255}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const CreateSendingDomainInput = z
  .object({
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(HOSTNAME, 'Enter a valid domain, e.g. mail.yourstore.com.'),
    region: z.enum(['us', 'eu']).default('us'),
  })
  .strict();

export type CreateSendingDomainInput = z.infer<typeof CreateSendingDomainInput>;
