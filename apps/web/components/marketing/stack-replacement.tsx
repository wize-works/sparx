import { Section, SectionHeader, Spark } from './primitives';

const OLD_STACK = [
  { initial: 'S', name: 'Shopify', sub: 'Storefront + Commerce', price: '$399', color: '#95BF47', dark: false },
  { initial: 'H', name: 'HubSpot', sub: 'CRM + marketing', price: '$1,600', color: '#FF7A59', dark: false },
  { initial: 'M', name: 'Mailchimp', sub: 'Email', price: '$350', color: '#FFE01B', dark: true },
  { initial: 'Z', name: 'Zapier', sub: 'Glue between everything', price: '$240', color: '#FF4F00', dark: false },
  { initial: 'W', name: 'WordPress + WooCommerce', sub: 'CMS', price: '$180', color: '#21759B', dark: false },
  { initial: '…', name: 'Dropship + Quote + Invoice apps', sub: '3–4 more', price: '$180', color: '#E5E5E5', dark: true },
] as const;

const NEW_STACK = [
  { initial: 'S', name: 'Sparx Storefront', color: '#6366F1' },
  { initial: 'C', name: 'Sparx Commerce', color: '#F97316' },
  { initial: 'C', name: 'Sparx CRM', color: '#06B6D4' },
  { initial: 'E', name: 'Sparx Email', color: '#0EA5E9' },
  { initial: 'C', name: 'Sparx CMS', color: '#14B8A6' },
  { initial: 'A', name: 'Sparx AI / MCP', color: '#EC4899' },
] as const;

export function StackReplacement() {
  return (
    <Section id="platform" padding="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
        <SectionHeader
          eyebrow="Stack consolidation"
          headline={
            <>
              Six tabs.
              <br />
              One bill
              <Spark />
            </>
          }
          lede={
            <>
              The average growing SMB pays $2,000–$3,000/mo across Shopify, HubSpot, Mailchimp,
              Zapier, and a dropship app — and still can&apos;t get a unified report. Sparx is one
              system with one data layer.
            </>
          }
        />

        <div className="mkt-stack-on-tablet" style={{ alignItems: 'stretch' }}>
          <Panel
            label="Before · Today"
            labelColor="var(--color-text-secondary)"
            priceLabel="$2,950/mo"
            priceColor="var(--color-danger)"
            heading="A fragmented stack."
          >
            {OLD_STACK.map((item, i) => (
              <Row
                key={item.name}
                isLast={i === OLD_STACK.length - 1}
                left={
                  <>
                    <BrandTile color={item.color} dark={item.dark}>
                      {item.initial}
                    </BrandTile>
                    <span
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 500,
                        fontSize: '14px',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {item.name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontSize: '13px',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      {item.sub}
                    </span>
                  </>
                }
                right={
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '13px',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {item.price}
                  </span>
                }
              />
            ))}
          </Panel>

          <Arrow />

          <Panel
            label="After · Sparx"
            labelColor="#A1A1AA"
            priceLabel="$449/mo"
            priceColor="#818CF8"
            heading={
              <>
                One platform
                <Spark />
              </>
            }
            invert
          >
            {NEW_STACK.map((item, i) => (
              <Row
                key={item.name}
                isLast={i === NEW_STACK.length - 1}
                invert
                left={
                  <>
                    <BrandTile color={item.color}>{item.initial}</BrandTile>
                    <span
                      style={{
                        fontFamily: 'var(--font-sans)',
                        fontWeight: 500,
                        fontSize: '14px',
                        color: '#FFFFFF',
                      }}
                    >
                      {item.name}
                    </span>
                  </>
                }
                right={
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 7,
                      height: 7,
                      borderRadius: 9999,
                      backgroundColor: 'var(--color-success)',
                    }}
                  />
                }
              />
            ))}
          </Panel>
        </div>
      </div>
    </Section>
  );
}

function Panel({
  label,
  labelColor,
  priceLabel,
  priceColor,
  heading,
  invert,
  children,
}: {
  label: string;
  labelColor: string;
  priceLabel: string;
  priceColor: string;
  heading: React.ReactNode;
  invert?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        padding: '32px',
        gap: '24px',
        backgroundColor: invert ? '#0A0A0A' : 'var(--color-bg-surface)',
        border: invert ? '1px solid #0A0A0A' : '1px solid var(--color-border-default)',
        borderTop: invert ? '3px solid var(--sparx-primary)' : undefined,
        borderRadius: '8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: '11px',
            letterSpacing: '0.08em',
            color: labelColor,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: priceColor,
          }}
        >
          {priceLabel}
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: '24px',
          letterSpacing: '-0.02em',
          color: invert ? '#FFFFFF' : 'var(--color-text-primary)',
          paddingTop: '4px',
        }}
      >
        {heading}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, paddingTop: '8px' }}>
        {children}
      </div>
    </div>
  );
}

function Row({
  left,
  right,
  isLast,
  invert,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  isLast?: boolean;
  invert?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 0',
        borderBottom: isLast ? undefined : `1px solid ${invert ? '#2A2A2A' : '#F4F4F5'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>{left}</div>
      {right}
    </div>
  );
}

function BrandTile({
  color,
  dark,
  children,
}: {
  color: string;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: 5,
        backgroundColor: color,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: '12px',
          color: dark ? '#0A0A0A' : '#FFFFFF',
        }}
      >
        {children}
      </span>
    </span>
  );
}

function Arrow() {
  return (
    <div className="mkt-arrow-connector">
      <svg width={60} height={20} viewBox="0 0 60 20" fill="none" aria-hidden>
        <path d="M0 10H56M56 10L46 1M56 10L46 19" stroke="var(--color-text-tertiary)" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
