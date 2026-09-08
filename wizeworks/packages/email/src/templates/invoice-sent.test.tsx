import { describe, expect, it } from 'vitest';
import { renderTemplate, type TemplateSend } from '../send';
import { TEMPLATE_PROPS } from '../template-fixtures';

// A template that throws, or that is missing from the worker's delivery gate,
// does not fail loudly: the event is acked, one warning is logged, and the email
// is gone. So this renders the real thing and reads it.
async function render(overrides: Partial<(typeof TEMPLATE_PROPS)['invoice-sent']> = {}) {
  const send: TemplateSend = {
    template: 'invoice-sent',
    to: 'dane@ferrouscoffee.test',
    props: { ...TEMPLATE_PROPS['invoice-sent'], ...overrides },
  };
  return renderTemplate(send);
}

describe('the invoice email', () => {
  it('names the BUSINESS in the subject, never the platform', async () => {
    const out = await render();
    expect(out.subject).toBe('Invoice INV-000148 from Rosa Flowers');
    expect(out.subject.toLowerCase()).not.toContain('sparx');
    expect(out.subject.toLowerCase()).not.toContain('piggles');
  });

  it('carries the document itself, because there is no page to link to', async () => {
    const { text } = await render();
    expect(text).toContain('Country sourdough, whole loaf');
    expect(text).toContain('48 × $8.50');
    expect(text).toContain('$408.00');
    expect(text).toContain('Seeded rye');
    expect(text).toContain('$216.00');
  });

  it('leads with what is STILL OWED once part of it is paid', async () => {
    const { text } = await render();
    expect(text).toContain('Still owed of $624.00');
    expect(text).toContain('-$200.00');
  });

  it('leads with the total when nothing has been paid', async () => {
    const { text } = await render({
      balance: 624,
      summary: [{ label: 'Subtotal', value: '$624.00' }],
    });
    expect(text).not.toContain('Still owed');
    expect(text).toContain('Invoice INV-000148');
  });

  it('says nothing about a due date when no terms were agreed', async () => {
    const { text } = await render({ dueAt: null });
    expect(text).not.toContain('due by');
    // ...and does not invent one in place of it.
    expect(text).toContain('Due on receipt');
  });

  it('prints the note the business wrote, and nothing when there is none', async () => {
    expect((await render()).text).toContain('August standing order');
    expect((await render({ note: null })).text).not.toContain('August standing order');
  });

  it('points replies at the business rather than at us', async () => {
    const { text } = await render();
    expect(text).toContain('goes straight to Rosa Flowers');
  });

  it('carries no platform masthead — the reader never bought anything from us', async () => {
    const { html } = await render();
    // React Email splits interpolated text with `<!-- -->` markers, so the
    // heading arrives as `Invoice<!-- --> from <!-- -->Rosa Flowers` and the
    // anchor this test slices on returned -1 — which made `slice(0, -1)` the
    // WHOLE document. It has been asserting nothing since, and passed only
    // because the footer happened to name the operating company rather than a
    // product. Strip the markers first so the anchor is real.
    const flat = html.replace(/<!-- -->/g, '');
    const anchor = flat.indexOf('Invoice from Rosa Flowers');
    expect(anchor, 'the heading anchor must exist, or this test slices nothing').toBeGreaterThan(0);
    const masthead = flat.slice(0, anchor).toLowerCase();
    expect(masthead).not.toContain('sparx');
    expect(masthead).not.toContain('piggles');
  });

  it('does not sign a shop invoice with the operating company', async () => {
    // The masthead was taken off this template with a long argument about how a
    // software product's name over somebody's invoice reads. The fine print at
    // the bottom went on saying "WizeWorks · sparx.works" to that same reader —
    // a company they have never dealt with, named as a party to a bill between
    // them and a shop. The quiet credit stays; the operator does not.
    const { html, text } = await render();
    expect(html).not.toContain('WizeWorks');
    expect(text).toContain('Sent with');
  });
});
