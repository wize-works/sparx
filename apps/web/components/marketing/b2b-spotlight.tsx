import { EyebrowBadge, Section, SectionHeader, Spark } from './primitives';

const FEATURES = [
  {
    icon: <PriceIcon />,
    number: '01',
    title: 'Account-tier pricing',
    body: 'Per-account price lists, volume breaks, contract pricing. Login determines price; no manual quote needed.',
  },
  {
    icon: <TermsIcon />,
    number: '02',
    title: 'Net terms & POs',
    body: 'Net 15, 30, 60, 90. PO number required at checkout. Aging reports, statements, dunning — built in.',
  },
  {
    icon: <FleetIcon />,
    number: '03',
    title: 'Fleet accounts',
    body: 'Vehicles, drivers, VIN-aware ordering. Service history per unit. PO routing per cost center.',
  },
  {
    icon: <RfqIcon />,
    number: '04',
    title: 'RFQ & quotes',
    body: 'Buyers request quotes from a product page. You reply with line-item pricing and expiration. Approved quotes convert to orders.',
  },
  {
    icon: <CalendarIcon />,
    number: '05',
    title: 'Service scheduling',
    body: 'Bookable bays, technicians, parts. Customer-portal scheduling. Reminders via Sparx Email.',
  },
  {
    icon: <ShieldIcon />,
    number: '06',
    title: 'Approval workflows',
    body: 'Spend caps per buyer. Manager approval for orders over a threshold. Multi-step approvals for enterprise customers.',
  },
] as const;

export function B2bSpotlight() {
  return (
    <Section padding="xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '80px' }}>
        <SectionHeader
          headlineSize={64}
          headlineLineHeight={68}
          eyebrow={
            <EyebrowBadge color="#475569" background="#F1F5F9" text="#334155">
              B2B · Wholesale · Fleet
            </EyebrowBadge>
          }
          headline={
            <>
              Industrial-grade,
              <br />
              out of the box
              <Spark color="#475569" />
            </>
          }
          lede={
            <>
              Shopify charges $2,400/mo for B2B and still doesn&apos;t do net terms properly. Sparx
              ships wholesale pricing, RFQ, purchase orders, fleet accounts, and service scheduling
              natively. $99/mo. Built for the way industrial actually works.
            </>
          }
        />

        <div className="mkt-grid-3-2-1">
          {FEATURES.map((f) => (
            <div
              key={f.number}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '32px',
                backgroundColor: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
                borderTop: '3px solid #475569',
                borderRadius: '8px',
                gap: '14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                {f.icon}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {f.number}
                </span>
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  fontSize: '20px',
                  letterSpacing: '-0.02em',
                  lineHeight: '26px',
                  color: 'var(--color-text-primary)',
                  paddingTop: '8px',
                  margin: 0,
                }}
              >
                {f.title}
              </h3>
              <p
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '13px',
                  lineHeight: '20px',
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                }}
              >
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function PriceIcon() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12V6L9 3L15 6V12M3 12V18L9 21L15 18V12M3 12L9 15L15 12M9 21V15"
        stroke="#475569"
        strokeWidth={1.5}
      />
    </svg>
  );
}
function TermsIcon() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={3} y={5} width={18} height={14} stroke="#475569" strokeWidth={1.5} />
      <path d="M3 9H21" stroke="#475569" strokeWidth={1.5} />
      <path d="M7 14H10" stroke="#475569" strokeWidth={1.5} />
    </svg>
  );
}
function FleetIcon() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx={7} cy={17} r={2} stroke="#475569" strokeWidth={1.5} />
      <circle cx={17} cy={17} r={2} stroke="#475569" strokeWidth={1.5} />
      <path
        d="M2 17H5M9 17H15M19 17H22M2 6V14H16V6H2ZM16 8H21L22 12V14H19"
        stroke="#475569"
        strokeWidth={1.5}
      />
    </svg>
  );
}
function RfqIcon() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 11L3 17V21H7L13 15M9 11L15 5C16 4 18 4 19 5C20 6 20 8 19 9L13 15M9 11L13 15"
        stroke="#475569"
        strokeWidth={1.5}
      />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={3} y={4} width={18} height={18} rx={1} stroke="#475569" strokeWidth={1.5} />
      <path d="M3 10H21M9 4V2M15 4V2M8 15H10M14 15H16" stroke="#475569" strokeWidth={1.5} />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2L4 6V12C4 17 7 21 12 22C17 21 20 17 20 12V6L12 2Z"
        stroke="#475569"
        strokeWidth={1.5}
      />
      <path d="M9 12L11 14L15 10" stroke="#475569" strokeWidth={1.5} />
    </svg>
  );
}
