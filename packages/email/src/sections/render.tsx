import * as React from 'react';
import { render } from '@react-email/render';
import type { EmailSectionInstance, SectionDataMap } from '@sparx/email-sections';
import { BrandProvider, type BrandTokens } from '../components';
import { spacing } from '../components/tokens';
import { EmailLayout } from '../templates/_layout';
import type { SendableEmail } from '../types';
import { SECTION_COMPONENTS } from './components';

// Compose a section-list body into a branded React Email tree, then render to
// inlined html + auto-generated plain text (docs/31 §7.3). The data map carries
// each section's resolved payload (from @sparx/email-platform's resolver);
// sections with no component or empty data omit themselves.

const FALLBACK_FROM = 'Sparx <noreply@sparx.email>';

function defaultFrom(): string {
  return process.env.SPARX_EMAIL_FROM ?? FALLBACK_FROM;
}

export interface RenderSectionsInput {
  sections: EmailSectionInstance[];
  subject: string;
  preheader?: string;
  to: string;
  from?: string;
  replyTo?: string;
  /** Resolved section data keyed by instance id. Omit for a config-only render
   *  (data-bound sections then render empty and omit themselves). */
  data?: SectionDataMap;
}

export interface RenderSectionsOptions {
  brand?: Partial<BrandTokens>;
}

/** Build the React Email element for a section body (no render) — used by tests
 *  and by callers that want to embed the tree. */
export function composeSections(
  input: Pick<RenderSectionsInput, 'sections' | 'subject' | 'preheader' | 'data'>,
  opts: RenderSectionsOptions = {}
): React.ReactElement {
  const { sections, subject, preheader, data } = input;
  return (
    <BrandProvider brand={opts.brand}>
      <EmailLayout preview={preheader ?? subject}>
        {sections.map((s: EmailSectionInstance) => {
          const Comp = SECTION_COMPONENTS[s.type];
          if (!Comp) return null;
          return (
            <div key={s.id} style={{ marginBottom: spacing.md }}>
              <Comp config={s.config} data={data?.[s.id]} />
            </div>
          );
        })}
      </EmailLayout>
    </BrandProvider>
  );
}

/** Render a section-list body to a SendableEmail (subject + html + text). */
export async function renderSections(
  input: RenderSectionsInput,
  opts: RenderSectionsOptions = {}
): Promise<SendableEmail> {
  const element = composeSections(input, opts);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return {
    from: input.from ?? defaultFrom(),
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    html,
    text,
  };
}
