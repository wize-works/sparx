// MJML → HTML compilation + Handlebars interpolation.
//
// MJML compilation is slow (50–100ms per template) so we do it once at
// boot. Handlebars compilation is also cached the same way. The result
// is two maps from template id → compiled HTML template fn / subject fn.
// Per-send work is then just Handlebars interpolation + html-to-text.
//
// Template authoring: each .mjml file lives under services/email-worker/
// templates/<id>.mjml. The first line of the file MUST be a comment
// containing the subject line, e.g.:
//
//   <!-- subject: Welcome to {{storeName}} -->
//   <mjml>...</mjml>
//
// Putting the subject in the file (rather than a sidecar JSON) keeps the
// whole email — body + subject — in one place to edit and review.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import mjml2html from 'mjml';
import { convert as htmlToText } from 'html-to-text';

type HbsTemplate = HandlebarsTemplateDelegate<Record<string, unknown>>;

interface CompiledTemplate {
  // Pre-rendered Handlebars template producing final HTML. The HTML
  // already contains the inlined CSS that MJML emits — Handlebars only
  // fills in `{{var}}` placeholders inside the static MJML output.
  html: HbsTemplate;
  // Subject line template — Handlebars over the comment string.
  subject: HbsTemplate;
}

const SUBJECT_RE = /^\s*<!--\s*subject:\s*(.+?)\s*-->/;

// Strict mode catches typos at render time rather than producing emails
// with literal `{{firstName}}` text. We re-enable lookup of missing keys
// only for explicit `{{else}}`-guarded blocks (Handlebars handles that
// internally — strict only fires on undeclared references).
const hbs = Handlebars.create();

const compiled = new Map<string, CompiledTemplate>();

export interface RenderResult {
  subject: string;
  html: string;
  text: string;
}

export async function loadTemplates(templatesDir?: string): Promise<string[]> {
  const dir = templatesDir ?? defaultTemplatesDir();
  const entries = await readdir(dir);
  const mjmlFiles = entries.filter((e) => e.endsWith('.mjml'));

  for (const file of mjmlFiles) {
    const id = file.replace(/\.mjml$/, '');
    const raw = await readFile(join(dir, file), 'utf8');

    const subjectMatch = SUBJECT_RE.exec(raw);
    if (!subjectMatch) {
      throw new Error(
        `template ${id}: first line must be "<!-- subject: ... -->" (declares the subject template)`
      );
    }
    const subjectSource = subjectMatch[1]!;

    // Strip the subject comment before MJML compilation so it doesn't
    // appear as a stray HTML comment in the rendered output.
    const mjmlSource = raw.replace(SUBJECT_RE, '').trimStart();

    // @types/mjml models mjml2html as Promise-returning; the runtime is
    // synchronous but await unwraps either way and keeps the types happy.
    const { html, errors } = await mjml2html(mjmlSource, { validationLevel: 'strict' });
    if (errors.length > 0) {
      const summary = errors
        .map((e: { formattedMessage: string }) => e.formattedMessage)
        .join('\n  ');
      throw new Error(`template ${id}: MJML errors:\n  ${summary}`);
    }

    compiled.set(id, {
      html: hbs.compile(html, { strict: true }),
      subject: hbs.compile(subjectSource, { strict: true }),
    });
  }

  return Array.from(compiled.keys());
}

export function render(template: string, vars: Record<string, unknown>): RenderResult {
  const tpl = compiled.get(template);
  if (!tpl) {
    throw new UnknownTemplateError(template);
  }

  const html = tpl.html(vars);
  const subject = tpl.subject(vars);
  const text = htmlToText(html, {
    selectors: [
      // Drop hidden tracking pixels + preheader-hide spans from the
      // plaintext rendering. The MJML output uses both for inboxing.
      { selector: 'img', format: 'skip' },
      { selector: '.preheader', format: 'skip' },
    ],
    wordwrap: 78,
  });

  return { subject, html, text };
}

export class UnknownTemplateError extends Error {
  constructor(template: string) {
    super(`Unknown email template: ${template}`);
    this.name = 'UnknownTemplateError';
  }
}

function defaultTemplatesDir(): string {
  // The compiled output sits at services/email-worker/src/templates.ts
  // → templates/ is a sibling of src/.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'templates');
}

// Test hook so suites can load a temp dir of fixture templates and reset
// between cases. Not used in production paths.
export function _resetTemplatesForTest(): void {
  compiled.clear();
}
