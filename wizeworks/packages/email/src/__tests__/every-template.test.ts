// Every coded template, actually rendered.
//
// `templates.test.ts` has a case named "wraps every coded template in the shared
// frame" that renders exactly ONE template and infers the rest. Seven of the twenty
// were covered that way; the other thirteen had never been rendered by any test at
// all — so a template that threw, leaked an `undefined` into a sentence, or shipped a
// raw `{{token}}` would have been found by the customer receiving it.
//
// The point here is BREADTH, not depth: per-template assertions stay in
// `templates.test.ts`, which is the place to pin a specific string. This asserts what
// must hold for ALL of them. `CASES` is typed `Record<TemplateId, …>`, so adding a
// template to the union without adding it here fails to compile rather than shipping
// untested.

import { describe, expect, it } from 'vitest';

import {
  _renderTemplateForTest,
  _setEmailProvider,
  consoleProvider,
  resetConsoleProvider,
} from '..';
import type { TemplateId } from '../send';
import { TEMPLATE_PROPS } from '../template-fixtures';

resetConsoleProvider();
_setEmailProvider(consoleProvider);

// The props themselves live in `src/template-fixtures.ts` — email-worker parses
// the SAME objects through its delivery gate, so the renderer and the gate can
// never quietly disagree about a template's shape.
const CASES = TEMPLATE_PROPS;

const IDS = Object.keys(CASES) as TemplateId[];

/**
 * Strip absolute URLs before asserting on a rendered body.
 *
 * Every URL in an email arrives as a PROP — the caller built it with
 * `appOrigin(brand)` and it is that call's business to be right, not the
 * template's. The fixtures pass sparx URLs because the fixtures were written for
 * sparx. What is asserted below is that the FRAME contributes no name of its
 * own, so the two concerns stay separated rather than conflated.
 */
const withoutUrls = (s: string) => s.replace(/https?:\/\/\S+/g, '');

describe('every coded template renders', () => {
  it.each(IDS)('%s', async (template) => {
    const out = await _renderTemplateForTest({
      template,
      to: 'someone@example.test',
      props: CASES[template],
    } as Parameters<typeof _renderTemplateForTest>[0]);

    expect(out.subject.trim(), 'subject').not.toBe('');
    expect(out.html.length, 'html').toBeGreaterThan(200);
    expect(out.text.trim(), 'text').not.toBe('');
    expect(out.templateId).toBe(template);

    // Nothing half-rendered may reach an inbox. `undefined` / `NaN` / `[object Object]`
    // are what a missing or mis-shaped prop looks like once it is inside a sentence,
    // and `{{` is a merge token nothing resolved.
    for (const body of [out.html, out.text]) {
      expect(body, 'raw merge token').not.toContain('{{');
      expect(body, 'undefined leaked').not.toMatch(/\bundefined\b/);
      expect(body, 'NaN leaked').not.toMatch(/\bNaN\b/);
      expect(body, 'object leaked').not.toContain('[object Object]');
    }
    expect(out.subject).not.toMatch(/\bundefined\b|\bNaN\b|\{\{/);

    // The shared frame is what makes this an email rather than loose HTML.
    //
    // This used to assert `sparx.works`, and it passed because `defaultBrand`
    // carried sparx's site URL — which is to say the assertion was pinning the
    // leak in place. A template rendered with NO brand and NO overlay must name
    // no product: what it can state is the OPERATOR, which is WizeWorks under
    // either brand and is the one identity that does not vary. The
    // brand-specific rendering is asserted below, where a brand is supplied.
    if (TENANT_TO_THEIR_CUSTOMER.has(template)) {
      // Not this reader's company. They bought from a shop.
      expect(out.html, 'operator named to a stranger').not.toContain('WizeWorks');
      expect(out.html, 'the quiet credit still signs it').toContain('Sent with');
    } else {
      expect(out.html, 'shared frame').toContain('WizeWorks');
    }
    // …except in the six templates that are ABOUT sparx (see SPARX_OWN_PRODUCTS
    // below), where the name is the subject matter rather than the chrome.
    if (!SPARX_OWN_PRODUCTS.has(template)) {
      expect(withoutUrls(out.html), 'the default frame names no product').not.toContain(
        'sparx.works'
      );
    }
  });

  it('has a case for every TemplateId', () => {
    // The `Record<TemplateId, …>` type catches a NEW id at compile time. This catches
    // the other direction — an id removed from the union but left behind here — and
    // pins the count so a silent drop is visible.
    expect(new Set(IDS).size).toBe(IDS.length);
    // 39 since `gated-delivery` — the signed, expiring link to a file somebody
    // gave their address for (docs/152 C4).
    expect(IDS.length).toBe(39);
  });
});

// ── The second brand ────────────────────────────────────────────────────────
//
// WizeWorks runs two products on one platform and one email worker drains the
// queue for both. Until 2026-08-16 every coded template named exactly one of
// them — in its masthead, its footer, its subject line and its body copy — so a
// Piggles owner's password reset arrived under sparx's wordmark, signed with
// sparx's name, from "sparx <noreply@…>".
//
// The check above pins the DEFAULT rendering. This one pins the other one, and
// it is the assertion that would have failed before the fix. `platform` is
// supplied by whoever resolves the send (email-worker, from the tenant's
// `platform_brand`); here it is supplied directly.

/**
 * Templates that name sparx because sparx is what they are ABOUT — its
 * marketplace, its own job ads. A Piggles tenant never receives one: there is no
 * Piggles marketplace to settle from (piggles/CLAUDE.md, "A sparx PRODUCT is not
 * a Piggles capability"). Renaming them would produce a grammatical sentence
 * about a product nobody can sign up for, which is worse than the leak because
 * nothing then looks wrong.
 *
 * THE PARTNER THREE CAME OFF THIS LIST. They were exempted on the same reasoning
 * and it did not survive contact: the programme is run out of shared platform
 * code (`services/api-rest/src/lib/partners/`), so "there is no Piggles partner
 * programme" is a statement about today's marketing rather than about the
 * software — and the exemption was doing real work in the meantime, holding
 * three subjects, two footer reasons and a hardcoded `sparx.works/partners` link
 * out of the sweep that fixed 110 others. They now resolve through
 * `usePlatformName()` like every other template, which renders identically for a
 * sparx partner and correctly for anyone else, and the two assertions below are
 * what keeps it that way (piggles/docs/personas/issues/128).
 */
/**
 * THE TENANT IS WRITING, AND WE ARE THE POST.
 *
 * These four reach somebody who has never heard of us: the customer being
 * billed, the visitor who swapped an email address for a download, the visitor
 * who filled in a contact form, the customer asked to put their name to a
 * document. They get the SHOP's identity and, at the very bottom, "Sent with
 * <product>" — the same quiet credit `silica/frame.ts` has always given.
 *
 * Everything else here is written to somebody who holds an account with us (an
 * owner, their staff, an applicant, a visitor to our own marketing site), and
 * for those the fine print naming the operator is right.
 *
 * The assertion below used to require `WizeWorks` on EVERY template, which is
 * the same mistake this file already records one paragraph up: an assertion can
 * pin a leak in place. It did — `WizeWorks · sparx.works` sat under a clothes
 * shop's invoice, and a check written to catch a brand leak was holding it
 * there.
 */
const TENANT_TO_THEIR_CUSTOMER = new Set<TemplateId>([
  'invoice-sent',
  'gated-delivery',
  'form-submission-confirmation',
  'document-signature-request',
]);

const SPARX_OWN_PRODUCTS = new Set<TemplateId>([
  'market-settlement-report',
  'job-application-received',
  'job-application-confirmation',
]);

/**
 * The other brand's palette, shaped exactly as `email-worker` supplies it —
 * `resolveEmailPalette(tenant.platform_brand)`, collapses already applied.
 *
 * The values are deliberately NOT Piggles' real ones. They are unmistakable
 * markers, because the assertion below has to distinguish "the palette reached
 * the render" from "a grey happened to appear in a grey email": a real palette
 * shares neutrals with every other palette, and an assertion that passes for the
 * wrong reason is the failure mode this whole file exists to catch.
 */
const OTHER_PALETTE = {
  accent: '#aa0011',
  accentContent: '#fffefd',
  accentEdge: '#880011',
  accentWash: '#ffeeee',
  ink: '#110022',
  inkContent: '#fffefd',
  inkMeta: '#998899',
  paper: '#fffdfb',
  canvas: '#eeddee',
  well: '#f7eef7',
  line: '#ddccdd',
  lineStrong: '#ccbbcc',
  heading: '#110022',
  body: '#332244',
  lead: '#443355',
  label: '#554466',
  meta: '#665577',
  success: '#008855',
  successWash: '#eeffee',
  warnInk: '#775500',
  warnWash: '#fff8ee',
  danger: '#aa0011',
  dangerWash: '#ffeeee',
  info: '#0044cc',
  infoWash: '#eeeeff',
  // Explicitly light-only. `null` is a real answer here — "this brand publishes
  // no night theme" — rather than an unset field, which is why the resolved type
  // keeps it nullable instead of collapsing it onto the light values.
  dark: null,
};

const OTHER_BRAND = {
  platform: {
    name: 'Piggles',
    url: 'https://meetpiggles.com',
    accentChars: 0,
    billingEmail: 'support@meetpiggles.com',
    appUrl: 'https://mypiggles.com',
    palette: OTHER_PALETTE,
  },
};

/**
 * The palette that used to be hardcoded in `signal`, with the comment "the
 * palette is sparx's own".
 *
 * One email worker drains the queue for both brands, so "sparx's own" was what a
 * Piggles owner's receipt got painted in — the same leak as the masthead
 * wordmark, one layer down and considerably harder to notice, because nothing in
 * the words is wrong. Every one of these is now a `<BRAND>_EMAIL_PALETTE` entry.
 *
 * Listed here as the thing that must NOT appear. If a hex creeps back into a
 * block component or the layout, this is what turns red.
 */
const SPARX_PALETTE_HEXES = [
  '#e04631', // Ember — the accent
  '#c13a28', // its pressed edge, and the danger ink
  '#fbe9e5', // its wash
  '#0c1433', // the masthead ink
  '#97a0bd', // meta on that masthead
  '#eceef2', // the canvas
  '#fafafc', // the footer well
  '#e8eaf0', // the hairline
  '#d3d7e0', // the stronger hairline
  '#cfd3dd', // the footer link underline
  '#2b3242', // body ink
  '#3a4152', // lead ink
  '#4b5563', // label ink
  '#5b6472', // meta ink
];

describe('every coded template speaks as the sending brand', () => {
  const ids = IDS.filter((id) => !SPARX_OWN_PRODUCTS.has(id));

  it.each(ids)('%s names no other company', async (template) => {
    const out = await _renderTemplateForTest(
      {
        template,
        to: 'someone@example.test',
        props: CASES[template],
      } as Parameters<typeof _renderTemplateForTest>[0],
      { brand: OTHER_BRAND }
    );

    for (const body of [out.html, out.text, out.subject]) {
      expect(withoutUrls(body).toLowerCase(), 'the other brand leaked').not.toContain('sparx');
    }
  });

  // The name was half of it. A Piggles owner's password reset also arrived
  // painted in Ember on a sparx-ink masthead, because the palette was a module
  // constant in a package both brands render through. This is the other half.
  it.each(ids)('%s is painted in no other brand’s colors', async (template) => {
    const out = await _renderTemplateForTest(
      {
        template,
        to: 'someone@example.test',
        props: CASES[template],
      } as Parameters<typeof _renderTemplateForTest>[0],
      { brand: OTHER_BRAND }
    );

    const html = out.html.toLowerCase();
    for (const hex of SPARX_PALETTE_HEXES) {
      expect(html, `${hex} survived into the other brand's render`).not.toContain(hex);
    }
  });

  // Absence proves nothing on its own — a template that painted NOTHING would
  // pass the check above. This is the positive half: the palette handed to the
  // send is the palette on the page.
  it('paints the platform chrome in the palette the send was given', async () => {
    const out = await _renderTemplateForTest(
      {
        template: 'password-reset',
        to: 'someone@example.test',
        props: CASES['password-reset'],
      },
      { brand: OTHER_BRAND }
    );

    const html = out.html.toLowerCase();
    // The masthead band, the card, the page behind it, the one action, and the
    // footer well — one assertion per structural element the chassis owns, so a
    // regression names the piece that broke rather than just "a color".
    expect(html, 'masthead band').toContain(OTHER_PALETTE.ink);
    expect(html, 'the card').toContain(OTHER_PALETTE.paper);
    expect(html, 'the page behind it').toContain(OTHER_PALETTE.canvas);
    expect(html, 'the one action').toContain(OTHER_PALETTE.accent);
    expect(html, 'the footer well').toContain(OTHER_PALETTE.well);
  });

  it('lets the sender name the From, and keeps the address it is given', async () => {
    // One Mailgun domain serves both brands, so the ADDRESS stays sparx's until
    // Piggles has DNS of its own — a deliverability fact, not a leak. The
    // display name in front of it is presentation, and does move.
    const out = await _renderTemplateForTest(
      {
        template: 'password-reset',
        to: 'someone@example.test',
        props: CASES['password-reset'],
      },
      { brand: OTHER_BRAND, from: 'Piggles <noreply@sparx.email>' }
    );

    expect(out.from).toBe('Piggles <noreply@sparx.email>');
  });

  it('puts the sending brand where the other one used to be', async () => {
    const out = await _renderTemplateForTest(
      {
        template: 'password-reset',
        to: 'someone@example.test',
        props: CASES['password-reset'],
      },
      { brand: OTHER_BRAND }
    );

    // The masthead wordmark, the body copy, the subject and the footer's legal
    // line — the four places the name appears, each of which was a literal.
    expect(out.html).toContain('Piggles');
    expect(out.subject).toBe('Set your Piggles password');
    expect(out.html).toContain('meetpiggles.com');
    expect(out.html).toContain('WizeWorks'); // the operator, correct for both
  });
});
