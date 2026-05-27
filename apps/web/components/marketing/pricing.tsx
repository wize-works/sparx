import { Section, SectionHeader, Spark } from './primitives';

const PLANS = [
  {
    name: 'Starter',
    description: 'Storefront + Commerce. Sell something today.',
    price: '$79',
    period: '/mo',
    includes: 'Storefront · Commerce · 0.5% txn fee',
  },
  {
    name: 'Growth',
    description: 'Adds CRM and Email. Talk to customers.',
    price: '$149',
    period: '/mo',
    includes: 'Storefront · Commerce · CRM · Email · 0.5% txn fee',
  },
  {
    name: 'Pro',
    description: 'All modules except B2B. Zero transaction fees.',
    price: '$299',
    period: '/mo',
    includes:
      'Storefront · Commerce · CMS · CRM · Email · AI/MCP · Dropship · 0% txn fee',
    featured: true,
  },
  {
    name: 'Business',
    description: 'Everything, including B2B / wholesale / fleet.',
    price: '$449',
    period: '/mo',
    includes: 'Every module · 0% txn fee · Priority support',
  },
] as const;

export function Pricing() {
  return (
    <Section id="pricing" padding="xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
        <SectionHeader
          eyebrow="Pricing"
          headline={
            <>
              Pay for what you use.
              <br />
              <span style={{ color: 'var(--color-text-tertiary)' }}>Own everything</span>
              <Spark />
            </>
          }
          lede={
            <>
              Bundles for simplicity, à la carte for precision. Transaction fees disappear at Pro.
              Enterprise is real software, not a sales process.
            </>
          }
        />

        <div className="mkt-grid-4-2-1">
          {PLANS.map((plan) => (
            <PlanCard key={plan.name} {...plan} />
          ))}
        </div>
      </div>
    </Section>
  );
}

type Plan = (typeof PLANS)[number];

function PlanCard({ name, description, price, period, includes, ...rest }: Plan) {
  const featured = 'featured' in rest && rest.featured;
  const dark = featured;
  const textPrimary = dark ? '#FFFFFF' : 'var(--color-text-primary)';
  const textSecondary = dark ? '#A1A1AA' : 'var(--color-text-secondary)';
  const textTertiary = dark ? '#52525B' : 'var(--color-text-tertiary)';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '32px',
        gap: '28px',
        backgroundColor: dark ? '#0A0A0A' : 'var(--color-bg-surface)',
        border: `1px solid ${dark ? '#0A0A0A' : 'var(--color-border-default)'}`,
        borderTop: dark ? '3px solid var(--sparx-primary)' : undefined,
        borderRadius: '8px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: '11px',
              letterSpacing: '0.08em',
              color: textSecondary,
              textTransform: 'uppercase',
            }}
          >
            {name}
          </span>
          {featured ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                backgroundColor: '#1E1B4B',
                borderRadius: '9999px',
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: 9999, backgroundColor: '#818CF8' }} />
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  fontSize: '10px',
                  letterSpacing: '0.05em',
                  color: '#818CF8',
                  textTransform: 'uppercase',
                }}
              >
                Popular
              </span>
            </span>
          ) : null}
        </div>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            lineHeight: '20px',
            color: textSecondary,
          }}
        >
          {description}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: '48px',
            letterSpacing: '-0.025em',
            color: textPrimary,
          }}
        >
          {price}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            color: textTertiary,
          }}
        >
          {period}
        </span>
      </div>

      <div
        style={{
          paddingTop: '16px',
          borderTop: `1px solid ${dark ? '#2A2A2A' : '#F4F4F5'}`,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            lineHeight: '20px',
            color: textSecondary,
          }}
        >
          {includes}
        </span>
      </div>
    </div>
  );
}
