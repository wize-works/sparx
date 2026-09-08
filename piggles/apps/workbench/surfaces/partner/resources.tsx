'use client';

// Resources — the material a partner uses when pitching sparx to a client, plus
// the playbooks for getting each module live.
//
// ── No server backing, and that's correct ─────────────────────────────────
// This is the ONE partner surface with no API behind it: the pitch, the one-pager
// and the onboarding guides are curated platform enablement content, the same for
// every partner, authored as data-as-code (like a help page) rather than fetched
// per tenant. So there is no RefreshButton — nothing to refetch — and no loading
// or error state. The toolbar instead carries the two links into the partner's own
// referral toolkit (their link, their listing), which ARE live surfaces.
//
// Content is written for a non-technical audience and kept terminology-correct: a
// business builds a SITE (content and/or commerce), pays only for the modules it
// switches on, and starts on a free trial.

import { Button, Heading, Text } from '@wizeworks/silicaui-react';
import { faArrowUpRightFromSquare, faShareNodes, faUser } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import type { OpenTarget, SurfaceContext } from '../../lib/surfaces/registry';
import { productCopy } from '../../lib/product';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-6';

interface PitchSection {
  heading: string;
  body: string;
  points?: string[];
}

const PITCH: PitchSection[] = [
  {
    heading: 'One platform instead of five tools',
    body: productCopy(
      'partner.pitch.platform',
      'Most businesses stitch together a site builder, a CRM, an email tool, an invoicing app and a pile of integrations — then pay for and maintain all of them. sparx is a single platform where those live together and actually talk to each other. Content and commerce, customers and campaigns, one login and one bill.'
    ),
  },
  {
    heading: 'They only pay for what they switch on',
    body: 'sparx is modular. A publisher can run content-only, a services team customers-only, a shop the full commerce stack — each is first-class. Modules switch on independently, and a client pays for exactly the ones they use. Nothing is bundled they didn’t ask for.',
    points: [
      'Site Builder — pages, content and design, live fast',
      'Commerce — catalog, checkout and payments',
      'CMS — pages, posts and structured content',
      'CRM — customers, pipelines and segments',
      'Email — broadcasts and flows on their own domain',
      'B2B, invoicing, inventory, scheduling, chat and AI as they grow',
    ],
  },
  {
    heading: 'Live in minutes, not months',
    body: 'A client picks the modules they need, starts from a complete themed template, and has a real site with real content in under an hour — then refines from there. No developer needed to get to launch.',
  },
  {
    heading: 'It grows with them',
    body: 'When a content site starts selling, they switch on Commerce. When they land wholesale accounts, they switch on B2B. Nothing to migrate, no replatforming — the data and the customers are already there.',
  },
  {
    heading: 'Getting started costs nothing',
    body: productCopy(
      'partner.pitch.pricing',
      'Every sparx account starts with a free trial — enough to build the whole thing and see it work before paying anything. After the trial it’s a subscription priced only on the modules they keep switched on.'
    ),
  },
];

const ONE_PAGER = {
  tagline: 'The modular platform for content and commerce — one login, one bill.',
  what: 'sparx replaces a business’s site builder, CRM, email tool and more with a single platform whose parts share the same customers, content and data. Turn on only what you need; add the rest as you grow.',
  bestFor: [
    'Owners tired of paying for and wiring up five separate tools',
    'Content sites that are starting to sell',
    'Service businesses that need a site, CRM and email in one place',
    'Wholesalers who need B2B and a public site together',
  ],
};

interface ModuleGuide {
  label: string;
  blurb: string;
  steps: string[];
}

const GUIDES: ModuleGuide[] = [
  {
    label: 'Site Builder',
    blurb: 'Stand up the client’s site — pages, layout and brand.',
    steps: [
      'Start from a template that fits the client’s industry, or a blank canvas.',
      'Set the brand — logo, colors and fonts in the theme, which every page inherits.',
      'Build the core pages (home, about, contact) from the component palette.',
      'Point their domain at the site in Settings → Domains, then publish.',
    ],
  },
  {
    label: 'Commerce',
    blurb: 'Turn the site into a shop — catalog, checkout, payments.',
    steps: [
      'Switch on Commerce and connect the client’s payment account.',
      'Add products (or import a catalog) with images, variants and prices.',
      'Set up shipping and tax, then place a test order end to end.',
      'Drop product and cart components onto the site and publish.',
    ],
  },
  {
    label: 'CMS',
    blurb: 'Give them a real content engine — pages and posts.',
    steps: [
      'Switch on CMS and define the content types they need (posts, guides, FAQs).',
      'Create a few starter entries so the layout has real content to show.',
      'Add a blog or index component to the site and link it in the navigation.',
      'Hand off the editor — it’s explicit-save, last-write-wins, like every editor.',
    ],
  },
  {
    label: 'CRM',
    blurb: 'One view of every customer, lead and deal.',
    steps: [
      'Switch on CRM — site forms and orders start creating customer records automatically.',
      'Set up the pipeline stages that match how the client actually sells.',
      'Import existing contacts and tag them into segments.',
      'Show the client the timeline: every order, email and note on one customer.',
    ],
  },
  {
    label: 'Email',
    blurb: 'Campaigns and flows that send from their own domain.',
    steps: [
      'Switch on Email and verify the client’s sending domain with the DNS records.',
      'Build a welcome flow triggered when a customer is created in CRM.',
      'Design a first broadcast from the email components.',
      'Confirm deliverability with a test send before going live.',
    ],
  },
  {
    label: 'B2B',
    blurb: 'Wholesale accounts, price lists and a buyer portal.',
    steps: [
      'Switch on B2B (Commerce comes with it) and create the wholesale accounts.',
      'Set per-account price lists and payment terms.',
      'Invite the buyers to the account portal.',
      'Test a wholesale order at account-specific pricing.',
    ],
  },
];

function targetFor(event: { shiftKey: boolean; altKey: boolean }): OpenTarget {
  if (event.altKey) return 'window';
  if (event.shiftKey) return 'beside';
  return 'tab';
}

export function ResourcesSurface({ ctx }: { ctx: SurfaceContext }) {
  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Resources actions"
        status={
          <span className="inline-flex items-center gap-1.5">
            <Text as="span" className="text-sm font-medium">
              Partner resources
            </Text>
          </span>
        }
        primary={
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            className="ml-auto shrink-0"
            onClick={(event) => {
              ctx.open('partner.referrals.list', undefined, { target: targetFor(event) });
            }}
          >
            <Icon glyph={faShareNodes} className="size-4" aria-hidden />
            Your referral link
          </Button>
        }
        controls={
          <Button
            size="sm"
            variant="outline"
            color="neutral"
            className="shrink-0"
            onClick={(event) => {
              ctx.open('partner.profile', undefined, { target: targetFor(event) });
            }}
          >
            <Icon glyph={faUser} className="size-4" aria-hidden />
            Your listing
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Pitch sparx, and get clients live
            </Heading>
            <Text>
              Everything you need to walk a client through sparx and get each part working for them.
              Use it in a conversation, print it, or send it on.
            </Text>
          </div>

          {/* The pitch — the honest story of sparx for a client conversation. */}
          <section className="card bg-base-100 flex flex-col gap-4 p-4">
            <Heading level={2} className="text-lg font-semibold">
              The sparx pitch
            </Heading>
            <div className="flex flex-col gap-4">
              {PITCH.map((section) => (
                <div key={section.heading} className="flex flex-col gap-1.5">
                  <Heading level={3} className="text-base font-semibold">
                    {section.heading}
                  </Heading>
                  <Text className="text-sm">{section.body}</Text>
                  {section.points ? (
                    <ul className="mt-1 flex flex-col gap-1">
                      {section.points.map((point) => (
                        <li key={point} className="flex items-start gap-2">
                          <span
                            className="bg-module mt-2 size-1.5 shrink-0 rounded-full"
                            aria-hidden
                          />
                          <Text className="text-sm">{point}</Text>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {/* One-pager — the single-screen summary to hand over. */}
          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <Heading level={2} className="text-lg font-semibold">
              One-pager
            </Heading>
            <Text className="font-medium">{ONE_PAGER.tagline}</Text>
            <Text className="text-sm">{ONE_PAGER.what}</Text>
            <div className="flex flex-col gap-1">
              <Text className="text-sm font-semibold">Best for</Text>
              <ul className="flex flex-col gap-1">
                {ONE_PAGER.bestFor.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="bg-module mt-2 size-1.5 shrink-0 rounded-full" aria-hidden />
                    <Text className="text-sm">{item}</Text>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Onboarding playbooks — module by module. */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Heading level={2} className="text-lg font-semibold">
                Get each module live
              </Heading>
              <Text className="text-sm">
                Short playbooks for what to do, in order, to get a client running on each part of
                sparx.
              </Text>
            </div>
            <div className="grid gap-3 @2xl:grid-cols-2">
              {GUIDES.map((guide) => (
                <div key={guide.label} className="card bg-base-100 flex flex-col gap-2 p-4">
                  <Heading level={3} className="text-base font-semibold">
                    {guide.label}
                  </Heading>
                  <Text className="text-sm">{guide.blurb}</Text>
                  <ol className="flex list-decimal flex-col gap-1 pl-5">
                    {guide.steps.map((step) => (
                      <li key={step}>
                        <Text as="span" className="text-sm">
                          {step}
                        </Text>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          {/* The referral toolkit — two live surfaces, opened as panes. */}
          <section className="card bg-base-100 flex flex-col gap-3 p-4">
            <Heading level={2} className="text-lg font-semibold">
              Your referral toolkit
            </Heading>
            <Text className="text-sm">
              Your shareable link and the businesses that signed up under it live on Referrals; how
              you appear to clients searching the directory lives on Your listing.
            </Text>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                color="module"
                variant="soft"
                onClick={(event) => {
                  ctx.open('partner.referrals.list', undefined, { target: targetFor(event) });
                }}
              >
                <Icon glyph={faShareNodes} className="size-4" aria-hidden />
                Open referrals
                <Icon glyph={faArrowUpRightFromSquare} className="size-3" aria-hidden />
              </Button>
              <Button
                size="sm"
                color="module"
                variant="soft"
                onClick={(event) => {
                  ctx.open('partner.profile', undefined, { target: targetFor(event) });
                }}
              >
                <Icon glyph={faUser} className="size-4" aria-hidden />
                Edit your listing
                <Icon glyph={faArrowUpRightFromSquare} className="size-3" aria-hidden />
              </Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
