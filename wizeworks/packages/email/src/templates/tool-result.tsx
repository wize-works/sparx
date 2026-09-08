import * as React from 'react';
import { Section } from '@react-email/components';
import { EmailLayout } from './_layout';
import {
  EmailHeading,
  EmailLink,
  EmailMuted,
  EmailParagraph,
  usePlatformName,
} from '../components';

// The free-tool result a visitor asked us to send them (docs/152 A3).
//
// sparx.works and Piggles each publish a set of free tools — an invoice builder,
// a margin calculator, a QR code maker, a UTM builder. Someone who finishes one
// has told us what kind of business they run through an ACTION rather than a
// form, and until now they used it and left. "Email this to me" delivers the
// thing they just made, at the moment they want it.
//
// ══════════════════════════════════════════════════════════════════════════
// WHAT THIS EMAIL MAY CARRY, AND WHAT IT MAY NEVER CARRY
// ══════════════════════════════════════════════════════════════════════════
//
// Several tool pages promise, in their own marketing copy, that the tool runs
// "100% in your browser, nothing uploaded" — the favicon generator says it in
// its meta description. That promise is about the visitor's OWN file, and it
// stays true only if we never take one.
//
// So `lines` carries ONLY values the tool COMPUTED: generated markup, a manifest
// snippet, a calculated margin, a built URL. Never a file the visitor supplied,
// never bytes derived from one, never an attachment. For a tool whose real
// output is a binary the browser assembled, the useful half to keep is the
// markup and the settings, and that is what gets sent — with a link back to
// rebuild the file locally.
//
// The endpoint enforces this by shape (it accepts label/value text, not files);
// this comment exists so the reason survives the next person who wonders why
// there is no attachment support here.
export interface ToolResultEmailProps {
  /** Display name of the tool ("Margin calculator"). */
  toolName: string;
  /** Absolute URL back to the tool, so they can pick up where they left off.
   *  Optional: it is derived from the resolved brand's site URL, which can be
   *  unset. The results are what was asked for and still arrive without it —
   *  better a missing link than an invented one. */
  toolUrl?: string;
  /** The computed output, as ordered label/value pairs. Never file content. */
  lines: { label: string; value: string }[];
  /** Optional closing note from the tool (a caveat, a next step). */
  note?: string | null;
}

export function ToolResultEmail({ toolName, toolUrl, lines, note }: ToolResultEmailProps) {
  // The sending brand, read from the same provider that paints the masthead —
  // never a name the caller passed in. A caller-supplied brand can disagree with
  // the brand the layout renders, and it did: a Piggles tool page signed off as
  // sparx under a piggles wordmark.
  const brandName = usePlatformName();

  return (
    <EmailLayout
      // A visitor of OURS asked us for this from our own marketing site.
      audience="platform"
      preview={`Your ${toolName} results`}
    >
      <Section>
        <EmailHeading>Your {toolName} results</EmailHeading>
        <EmailParagraph>
          Here is what you just made. Nothing is saved on our side beyond this email, so keep it
          somewhere you will find it again.
        </EmailParagraph>

        {/* One paragraph per computed line, deliberately NOT wrapped in an
            EmailCallout: that component renders its children inside a single
            text node, so nesting paragraphs in it produces invalid markup that
            some clients render as one run-on line. */}
        {lines.map((line) => (
          <EmailParagraph key={line.label}>
            <strong>{line.label}:</strong> {line.value}
          </EmailParagraph>
        ))}

        {note ? <EmailParagraph>{note}</EmailParagraph> : null}

        {toolUrl ? (
          <EmailParagraph>
            <EmailLink href={toolUrl}>Open the {toolName} again</EmailLink>
          </EmailParagraph>
        ) : null}

        <EmailMuted>
          You asked {brandName} to send this. It is the only thing we will send unless you tell us
          otherwise.
        </EmailMuted>
      </Section>
    </EmailLayout>
  );
}

export function toolResultSubject(toolName: string): string {
  return `Your ${toolName} results`;
}
