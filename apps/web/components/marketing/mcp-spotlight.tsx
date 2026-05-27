import { Container, EyebrowBadge, SectionHeader, Spark } from './primitives';

const FEATURES = [
  {
    number: '01',
    title: 'First-class server.',
    body: 'Not a plugin. The MCP server is part of the platform, scoped to your tenant, deployed alongside the API.',
  },
  {
    number: '02',
    title: 'Read & write.',
    body: 'Query orders, customers, products. Create drafts. Update inventory. Send a quote. Everything the API can do, your AI can do.',
  },
  {
    number: '03',
    title: 'Scoped, audited.',
    body: 'Per-agent API keys. Per-tool permissions. Every call written to the audit log. Revoke in one click.',
  },
  {
    number: '04',
    title: 'Works with everyone.',
    body: 'Claude, ChatGPT, Copilot, Cursor, any MCP-compatible client. One endpoint, all of them.',
  },
] as const;

const RESULTS = [
  { n: '01', name: 'Ranchero Trucking Co.', revenue: '$48,200', status: 'active' as const, days: undefined },
  { n: '02', name: 'Halcyon & Reed', revenue: '$41,800', status: 'active' as const, days: undefined },
  { n: '03', name: 'Northwind Supply', revenue: '$36,400', status: 'cold' as const, days: '51d' },
  { n: '04', name: 'Pacific Forge Logistics', revenue: '$29,150', status: 'cold' as const, days: '48d' },
] as const;

export function McpSpotlight() {
  return (
    <section
      style={{
        paddingTop: 'var(--section-py-xl)',
        paddingBottom: 'var(--section-py-xl)',
        paddingLeft: 'var(--gutter-page)',
        paddingRight: 'var(--gutter-page)',
        backgroundColor: '#0A0A0A',
      }}
    >
      <Container style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
      <SectionHeader
        invert
        headlineSize={64}
        headlineLineHeight={68}
        eyebrow={
          <EyebrowBadge color="#EC4899" background="#2D0A1E" text="#EC4899">
            AI · MCP
          </EyebrowBadge>
        }
        headline={
          <>
            Ask your AI
            <br />
            anything
            <Spark color="#EC4899" />
          </>
        }
        lede={
          <>
            Sparx is the first commerce platform built around the Model Context Protocol. Connect
            Claude, ChatGPT, or Copilot once, then read live business data with plain English. No
            exports. No CSVs. No Zapier.
          </>
        }
      />

      <div className="mkt-stack-on-tablet" style={{ alignItems: 'stretch', gap: '32px' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '480px',
            maxWidth: '100%',
            flexShrink: 0,
            gap: '32px',
            paddingTop: '24px',
          }}
        >
          {FEATURES.map((f) => (
            <div key={f.number} style={{ display: 'flex', gap: '18px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  color: '#52525B',
                  paddingTop: '4px',
                  width: '30px',
                  flexShrink: 0,
                }}
              >
                {f.number}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 500,
                    fontSize: '18px',
                    letterSpacing: '-0.015em',
                    color: '#FFFFFF',
                  }}
                >
                  {f.title}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '14px',
                    lineHeight: '22px',
                    color: '#A1A1AA',
                  }}
                >
                  {f.body}
                </span>
              </div>
            </div>
          ))}
        </div>

        <ChatCard />
      </div>
      </Container>
    </section>
  );
}

function ChatCard() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        backgroundColor: '#1A1A1A',
        border: '1px solid #2A2A2A',
        borderTop: '3px solid #EC4899',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #2A2A2A',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 18,
              height: 18,
              backgroundColor: '#EC4899',
              borderRadius: '5px',
            }}
          >
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 2L14 9L21 9L15 14L17 21L12 17L7 21L9 14L3 9L10 9L12 2Z"
                fill="#FFFFFF"
              />
            </svg>
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: '13px',
              color: '#FFFFFF',
            }}
          >
            Claude
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              color: '#52525B',
            }}
          >
            · connected to sparx-mcp
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: 6, height: 6, borderRadius: 9999, backgroundColor: '#10B981' }} />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: '#A1A1AA',
            }}
          >
            live
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', padding: '24px', gap: '20px' }}>
        <Message label="You" labelColor="#52525B">
          <div
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '15px',
              lineHeight: '24px',
              color: '#F0F0F0',
              backgroundColor: '#222222',
              padding: '14px 18px',
              borderRadius: '10px',
              maxWidth: '90%',
            }}
          >
            Who were our top 10 fleet customers last quarter, and which ones haven&apos;t reordered
            in 45 days?
          </div>
        </Message>

        <ToolCallBlock />

        <Message label="Claude" labelColor="#EC4899">
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '15px',
              lineHeight: '24px',
              color: '#F0F0F0',
            }}
          >
            Pulled from your CRM.{' '}
            <span style={{ color: '#A1A1AA' }}>
              Top 10 by Q1 revenue; 3 marked as cold (45+ days since last order):
            </span>
          </span>
        </Message>

        <ResultList />

        <Actions />
      </div>
    </div>
  );
}

function Message({
  label,
  labelColor,
  children,
}: {
  label: string;
  labelColor: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
      {children}
    </div>
  );
}

function ToolCallBlock() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: '11px',
          letterSpacing: '0.08em',
          color: '#52525B',
          textTransform: 'uppercase',
        }}
      >
        Tool call · sparx.crm.search
      </span>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          lineHeight: '20px',
          color: '#A1A1AA',
          backgroundColor: '#0F0F0F',
          border: '1px solid #2A2A2A',
          padding: '14px 16px',
          borderRadius: '8px',
        }}
      >
        <span style={{ color: '#818CF8' }}>filter</span>: {'{ segment: '}
        <span style={{ color: '#10B981' }}>&quot;fleet&quot;</span>, sort:{' '}
        <span style={{ color: '#10B981' }}>&quot;revenue_desc&quot;</span>, period:{' '}
        <span style={{ color: '#10B981' }}>&quot;q1_2026&quot;</span>, limit:{' '}
        <span style={{ color: '#F97316' }}>10</span> {'}'}
      </div>
    </div>
  );
}

function ResultList() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0F0F0F',
        border: '1px solid #2A2A2A',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {RESULTS.map((r, i) => (
        <div
          key={r.n}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '11px 16px',
            gap: '14px',
            borderBottom: i === RESULTS.length - 1 ? undefined : '1px solid #2A2A2A',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: '#52525B',
              width: '24px',
            }}
          >
            {r.n}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: '13px',
              color: '#F0F0F0',
              flex: 1,
            }}
          >
            {r.name}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: '#A1A1AA',
              width: '90px',
              textAlign: 'right',
            }}
          >
            {r.revenue}
          </span>
          <div style={{ width: '88px', display: 'flex', justifyContent: 'flex-end' }}>
            <StatusPill status={r.status} days={r.days} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ status, days }: { status: 'active' | 'cold'; days?: string }) {
  const active = status === 'active';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '2px 8px',
        backgroundColor: active ? '#022C22' : '#2C1503',
        borderRadius: '9999px',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 9999,
          backgroundColor: active ? '#10B981' : '#F97316',
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: '10px',
          color: active ? '#10B981' : '#F97316',
          textTransform: 'uppercase',
        }}
      >
        {active ? 'Active' : `Cold ${days}`}
      </span>
    </span>
  );
}

function Actions() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px' }}>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: '14px',
          lineHeight: '22px',
          color: '#A1A1AA',
        }}
      >
        Want me to draft a re-engagement email to the cold ones, or pull last-order detail first?
      </span>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {['Draft re-engagement email', 'Pull last-order detail', 'Tag in CRM'].map((label) => (
          <span
            key={label}
            style={{
              padding: '7px 12px',
              backgroundColor: '#222222',
              border: '1px solid #2A2A2A',
              borderRadius: '9999px',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              color: '#F0F0F0',
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
