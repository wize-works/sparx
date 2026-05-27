import { Section, SectionHeader, Spark } from './primitives';

const FEATURES = [
  {
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M8 5L3 12L8 19M16 5L21 12L16 19" stroke="var(--color-text-primary)" strokeWidth={2} />
      </svg>
    ),
    title: 'REST + GraphQL',
    body: 'One schema, two transports. Versioned, deprecation-warned, never silently broken.',
  },
  {
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx={12} cy={12} r={3} stroke="var(--color-text-primary)" strokeWidth={2} />
        <path
          d="M12 1V5M12 19V23M4.2 4.2L7 7M17 17L19.8 19.8M1 12H5M19 12H23M4.2 19.8L7 17M17 7L19.8 4.2"
          stroke="var(--color-text-primary)"
          strokeWidth={2}
        />
      </svg>
    ),
    title: 'Pub/Sub webhooks',
    body: 'order.created, customer.updated, email.send. Subscribe; we deliver with retries and signed payloads.',
  },
  {
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x={3} y={3} width={18} height={18} rx={2} stroke="var(--color-text-primary)" strokeWidth={2} />
        <path d="M9 9H15V15H9V9Z" stroke="var(--color-text-primary)" strokeWidth={2} />
      </svg>
    ),
    title: 'Headless SDKs',
    body: 'Storefront SDK for Next.js, Remix, Astro. TypeScript types generated from your schema.',
  },
  {
    icon: (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M21 16V8L12 3L3 8V16L12 21L21 16Z"
          stroke="var(--color-text-primary)"
          strokeWidth={2}
        />
      </svg>
    ),
    title: 'Self-host or managed',
    body: 'Run Sparx on your own GKE cluster, or let WizeWorks operate it ($750/mo, includes Gillett-tier support).',
  },
] as const;

export function DeveloperSection() {
  return (
    <Section id="docs" padding="xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
        <SectionHeader
          eyebrow="Developers"
          headline={
            <>
              API-first means
              <br />
              the UI is one consumer
              <Spark />
            </>
          }
          lede={
            <>
              Every Sparx feature exists as a REST and GraphQL endpoint before it exists as a
              screen. Webhook into Pub/Sub. Ship headless with the storefront SDK. Self-host if you
              want it.
            </>
          }
        />

        <div className="mkt-stack-on-tablet" style={{ alignItems: 'stretch', gap: '32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '20px', minWidth: 0 }}>
            {FEATURES.map((f) => (
              <div
                key={f.title}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '24px',
                  backgroundColor: 'var(--color-bg-surface)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: '8px',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {f.icon}
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 500,
                      fontSize: '15px',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {f.title}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    lineHeight: '20px',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {f.body}
                </span>
              </div>
            ))}
          </div>

          <CodeCard />
        </div>
      </div>
    </Section>
  );
}

function CodeCard() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        backgroundColor: '#0A0A0A',
        border: '1px solid #2A2A2A',
        borderTop: '3px solid var(--sparx-primary)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      <CodeTabs />
      <CodeBody />
    </div>
  );
}

function CodeTabs() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        backgroundColor: '#0F0F0F',
        borderBottom: '1px solid #2A2A2A',
      }}
    >
      <span
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--sparx-primary)',
          fontFamily: 'var(--font-mono)',
          fontWeight: 500,
          fontSize: '12px',
          color: '#FFFFFF',
        }}
      >
        create-order.ts
      </span>
      {['curl', 'graphql.gql', 'webhook.json'].map((t) => (
        <span
          key={t}
          style={{
            padding: '14px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: '#52525B',
          }}
        >
          {t}
        </span>
      ))}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ width: 6, height: 6, borderRadius: 9999, backgroundColor: '#10B981' }} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: '#A1A1AA',
          }}
        >
          200 OK · 41ms
        </span>
      </div>
    </div>
  );
}

const LINES = Array.from({ length: 17 }, (_, i) => i + 1);

const CODE: React.ReactNode[] = [
  <span key="c1" style={{ color: '#52525B' }}>{'// Place a B2B order with net 30 terms'}</span>,
  <>
    <span style={{ color: '#EC4899' }}>import</span> {'{ sparx }'}{' '}
    <span style={{ color: '#EC4899' }}>from</span>{' '}
    <span style={{ color: '#10B981' }}>&quot;@sparx/api&quot;</span>;
  </>,
  ' ',
  <>
    <span style={{ color: '#EC4899' }}>const</span>{' '}
    <span style={{ color: '#06B6D4' }}>client</span> = sparx({'{ '}
    <span style={{ color: '#A1A1AA' }}>apiKey:</span>{' '}
    <span style={{ color: '#10B981' }}>process.env.SPARX_KEY</span>
    {' }'});
  </>,
  ' ',
  <>
    <span style={{ color: '#EC4899' }}>const</span>{' '}
    <span style={{ color: '#06B6D4' }}>order</span> ={' '}
    <span style={{ color: '#EC4899' }}>await</span> client.
    <span style={{ color: '#F97316' }}>commerce</span>.orders.
    <span style={{ color: '#818CF8' }}>create</span>({'{'}
  </>,
  <>
    {'  '}
    <span style={{ color: '#A1A1AA' }}>customerId:</span>{' '}
    <span style={{ color: '#10B981' }}>&quot;cus_8R4Xz1QkM&quot;</span>,{' '}
    <span style={{ color: '#52525B' }}>{'// Halcyon & Reed'}</span>
  </>,
  <>
    {'  '}
    <span style={{ color: '#A1A1AA' }}>module:</span>{' '}
    <span style={{ color: '#10B981' }}>&quot;b2b&quot;</span>,
  </>,
  <>
    {'  '}
    <span style={{ color: '#A1A1AA' }}>terms:</span> {'{ type: '}
    <span style={{ color: '#10B981' }}>&quot;net&quot;</span>, days:{' '}
    <span style={{ color: '#F97316' }}>30</span> {'}'},
  </>,
  <>
    {'  '}
    <span style={{ color: '#A1A1AA' }}>poNumber:</span>{' '}
    <span style={{ color: '#10B981' }}>&quot;PO-8841&quot;</span>,
  </>,
  <>
    {'  '}
    <span style={{ color: '#A1A1AA' }}>lines:</span> [
  </>,
  <>
    {'    { '}
    <span style={{ color: '#A1A1AA' }}>sku:</span>{' '}
    <span style={{ color: '#10B981' }}>&quot;INJ-6.7-CR&quot;</span>,{' '}
    <span style={{ color: '#A1A1AA' }}>qty:</span>{' '}
    <span style={{ color: '#F97316' }}>8</span> {' },'}
  </>,
  <>
    {'    { '}
    <span style={{ color: '#A1A1AA' }}>sku:</span>{' '}
    <span style={{ color: '#10B981' }}>&quot;FLT-FUEL-CAT3&quot;</span>,{' '}
    <span style={{ color: '#A1A1AA' }}>qty:</span>{' '}
    <span style={{ color: '#F97316' }}>24</span> {' },'}
  </>,
  '  ],',
  '});',
  ' ',
  <span key="c-final" style={{ color: '#52525B' }}>
    {'// → order.id: "ord_KdQ19wPmFf" · status: "approved"'}
  </span>,
];

function CodeBody() {
  return (
    <div style={{ display: 'flex', padding: '24px 0', backgroundColor: '#0A0A0A', overflowX: 'auto' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '0 16px',
          gap: '7px',
          borderRight: '1px solid #1A1A1A',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          lineHeight: '20px',
          color: '#3F3F46',
        }}
      >
        {LINES.map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '0 20px',
          gap: '7px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          lineHeight: '20px',
          color: '#F0F0F0',
        }}
      >
        {CODE.map((line, i) => (
          <span key={i}>{line}</span>
        ))}
      </div>
    </div>
  );
}
