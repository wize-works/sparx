import { ModuleProvider, type SparxModule } from '@sparx/ui';
import { Section, SectionHeader, Dot, getModuleColor, type MarketingModule } from './primitives';

interface ModuleCard {
  id: SparxModule & MarketingModule;
  number: string;
  label: string;
  title: string;
  description: string;
  price: string;
}

const MODULES: ModuleCard[] = [
  {
    id: 'storefront',
    number: '01',
    label: 'Storefront',
    title: 'Themes, pages, live URLs.',
    description:
      'The site builder. Pick a theme, edit blocks, point your domain. No code. No staging dance.',
    price: '$49/mo',
  },
  {
    id: 'commerce',
    number: '02',
    label: 'Commerce',
    title: 'Cart, checkout, orders.',
    description: 'Products, inventory, payments. Stripe, PayPal, Klarna. Tax and shipping handled.',
    price: '+$49/mo',
  },
  {
    id: 'cms',
    number: '03',
    label: 'CMS',
    title: 'Words, media, SEO.',
    description:
      'Editor, blog, media library, structured content. Works standalone — no storefront required.',
    price: '$49/mo',
  },
  {
    id: 'crm',
    number: '04',
    label: 'CRM',
    title: 'Customers, pipeline, signal.',
    description:
      'Activity log, automations, segments. Built on your commerce data — not stitched to it.',
    price: '+$49/mo',
  },
  {
    id: 'email',
    number: '05',
    label: 'Email',
    title: 'Transactional and marketing.',
    description:
      'Self-hosted Postal on sparx.email. Your domain, your reputation. No SendGrid markup.',
    price: '+$29/mo',
  },
  {
    id: 'b2b',
    number: '06',
    label: 'B2B',
    title: 'Accounts, net terms, fleet.',
    description:
      'Wholesale pricing, RFQ, purchase orders, service scheduling. Built for industrial.',
    price: '+$99/mo',
  },
  {
    id: 'ai',
    number: '07',
    label: 'AI / MCP',
    title: 'Your AI speaks your data.',
    description:
      'First-class MCP server. Claude, ChatGPT, and Copilot read live business data — natively.',
    price: '+$49/mo',
  },
  {
    id: 'dropship',
    number: '08',
    label: 'Dropship',
    title: 'Suppliers, sync, fulfillment.',
    description: 'Catalog sync, margin math, automated order routing. Sell without inventory.',
    price: '+$29/mo',
  },
];

export function ModulesGrid() {
  return (
    <Section id="modules" surface="surface" padding="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
        <SectionHeader
          eyebrow="The modules"
          headline={
            <>
              Eight pieces.{' '}
              <span style={{ color: 'var(--color-text-tertiary)' }}>
                Activate only what you need.
              </span>
            </>
          }
          lede={
            <>
              Modules share one data layer, one dashboard, one bill. Turn one on for $29–$99/mo.
              Turn it off and it stops billing — no migration, no exports, no goodbyes.
            </>
          }
        />

        <div className="mkt-grid-4-2-1">
          {MODULES.map((m) => (
            <ModuleProvider key={m.id} module={m.id} style={{ display: 'flex' }}>
              <ModuleCard {...m} />
            </ModuleProvider>
          ))}
        </div>
      </div>
    </Section>
  );
}

function ModuleCard({ id, number, label, title, description, price }: ModuleCard) {
  const color = getModuleColor(id);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-default)',
        borderTop: `3px solid ${color.color}`,
        borderRadius: '8px',
        padding: '28px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            backgroundColor: color.tint,
            borderRadius: '9999px',
          }}
        >
          <Dot color={color.color} />
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: '11px',
              letterSpacing: '0.05em',
              color: color.text,
              textTransform: 'uppercase',
            }}
          >
            {label}
          </span>
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {number}
        </span>
      </div>

      <h3
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: '24px',
          letterSpacing: '-0.02em',
          lineHeight: '30px',
          color: 'var(--color-text-primary)',
          paddingTop: '40px',
          margin: 0,
        }}
      >
        {title}
      </h3>

      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
          lineHeight: '22px',
          color: 'var(--color-text-secondary)',
          paddingTop: '10px',
          margin: 0,
        }}
      >
        {description}
      </p>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '48px',
          marginTop: '32px',
          borderTop: '1px solid #F4F4F5',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: '14px',
            color: 'var(--color-text-primary)',
          }}
        >
          {price.split('/')[0]}
          <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>
            /{price.split('/')[1]}
          </span>
        </span>
        <a
          href={`/${id}`}
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: '13px',
            color: color.color,
            textDecoration: 'none',
          }}
        >
          Learn →
        </a>
      </div>
    </div>
  );
}
