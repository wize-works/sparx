import { Section, SectionHeader, Spark, Wordmark } from './primitives';

type Cell =
  | { kind: 'check' }
  | { kind: 'cross' }
  | { kind: 'text'; text: string; color?: string };

const ROWS: { capability: React.ReactNode; cells: [Cell, Cell, Cell, Cell]; highlight?: boolean }[] = [
  {
    capability: 'Live store in under 5 minutes',
    cells: [
      { kind: 'check' },
      { kind: 'text', text: '~60 min' },
      { kind: 'cross' },
      { kind: 'text', text: 'days' },
    ],
  },
  {
    capability: 'Modular activation — pay per module',
    cells: [{ kind: 'check' }, { kind: 'cross' }, { kind: 'cross' }, { kind: 'cross' }],
  },
  {
    capability: 'CMS standalone — no shop required',
    cells: [{ kind: 'check' }, { kind: 'cross' }, { kind: 'cross' }, { kind: 'check' }],
  },
  {
    capability: 'Built-in CRM with commerce data',
    cells: [
      { kind: 'check' },
      { kind: 'text', text: 'via app' },
      { kind: 'check' },
      { kind: 'cross' },
    ],
  },
  {
    capability: (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
        Native MCP / AI integration
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            backgroundColor: '#FDF2F8',
            border: '1px solid #EC4899',
            borderRadius: '9999px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: '10px',
            letterSpacing: '0.05em',
            color: '#9D174D',
            textTransform: 'uppercase',
          }}
        >
          Unique
        </span>
      </span>
    ),
    cells: [{ kind: 'check' }, { kind: 'cross' }, { kind: 'cross' }, { kind: 'cross' }],
    highlight: true,
  },
  {
    capability: 'Built-in email infrastructure (your domain)',
    cells: [{ kind: 'check' }, { kind: 'cross' }, { kind: 'check' }, { kind: 'cross' }],
  },
  {
    capability: 'B2B / Wholesale / Fleet — native',
    cells: [
      { kind: 'check' },
      { kind: 'text', text: '+$2,400/mo', color: 'var(--color-danger)' },
      { kind: 'cross' },
      { kind: 'cross' },
    ],
  },
  {
    capability: 'Dropship + supplier routing — native',
    cells: [
      { kind: 'check' },
      { kind: 'text', text: 'via apps' },
      { kind: 'cross' },
      { kind: 'text', text: 'via plugins' },
    ],
  },
  {
    capability: 'Single monthly bill across all functions',
    cells: [{ kind: 'check' }, { kind: 'cross' }, { kind: 'cross' }, { kind: 'cross' }],
  },
  {
    capability: 'Headless / API-first',
    cells: [
      { kind: 'check' },
      { kind: 'text', text: '+cost', color: 'var(--color-danger)' },
      { kind: 'cross' },
      { kind: 'text', text: 'REST only' },
    ],
  },
  {
    capability: 'Self-host option available',
    cells: [{ kind: 'check' }, { kind: 'cross' }, { kind: 'cross' }, { kind: 'check' }],
  },
  {
    capability: '0% transaction fees (Pro+)',
    cells: [
      { kind: 'check' },
      { kind: 'text', text: 'Advanced +' },
      { kind: 'text', text: 'n/a' },
      { kind: 'check' },
    ],
  },
];

const COL_WIDTHS = ['160px', '140px', '140px', '140px'] as const;

export function CompareTable() {
  return (
    <Section surface="surface" padding="xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
        <SectionHeader
          eyebrow="Vs everything else"
          headline={
            <>
              The capability gap
              <Spark />
            </>
          }
          lede={
            <>
              Shopify, HubSpot, and WordPress each solve part of the problem. Stitching them costs
              an admin, a Zapier seat, and a quarter of &ldquo;we&apos;ll fix the data later.&rdquo;
              Sparx ships the whole stack.
            </>
          }
        />

        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '0 calc(var(--gutter-page) * -1)', padding: '0 var(--gutter-page)' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--color-border-default)',
            borderRadius: '8px',
            overflow: 'hidden',
            backgroundColor: 'var(--color-bg-surface)',
            minWidth: '760px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '18px 24px',
              backgroundColor: 'var(--color-bg-page)',
              borderBottom: '1px solid var(--color-border-default)',
              gap: '16px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: '11px',
                letterSpacing: '0.08em',
                color: 'var(--color-text-secondary)',
                textTransform: 'uppercase',
                flex: 1,
              }}
            >
              Capability
            </span>
            <ColHeader
              width={COL_WIDTHS[0]}
              highlight
              title={<Wordmark size={13} />}
              subtitle="$79–$449/mo"
              subtitleColor="var(--sparx-primary)"
            />
            <ColHeader width={COL_WIDTHS[1]} title="Shopify" subtitle="$39–$399/mo" />
            <ColHeader width={COL_WIDTHS[2]} title="HubSpot" subtitle="$45–$1,600/mo" />
            <ColHeader
              width={COL_WIDTHS[3]}
              title="WordPress"
              subtitle="Self-host + plugins"
            />
          </div>

          {ROWS.map((row, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '18px 24px',
                gap: '16px',
                borderBottom: i === ROWS.length - 1 ? undefined : '1px solid #F4F4F5',
                backgroundColor: row.highlight ? '#FDF2F8' : undefined,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  fontSize: '14px',
                  color: 'var(--color-text-primary)',
                  flex: 1,
                }}
              >
                {row.capability}
              </span>
              {row.cells.map((cell, j) => (
                <CellView key={j} cell={cell} width={COL_WIDTHS[j]!} />
              ))}
            </div>
          ))}
        </div>
        </div>
      </div>
    </Section>
  );
}

function ColHeader({
  width,
  title,
  subtitle,
  subtitleColor,
  highlight,
}: {
  width: string;
  title: React.ReactNode;
  subtitle: string;
  subtitleColor?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        width,
        flexShrink: 0,
        padding: highlight ? '4px 8px' : undefined,
        backgroundColor: highlight ? 'var(--color-bg-surface)' : undefined,
        border: highlight ? '1px solid var(--sparx-primary)' : undefined,
        borderRadius: highlight ? '6px' : undefined,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: '13px',
          color: 'var(--color-text-primary)',
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: subtitleColor ?? 'var(--color-text-tertiary)',
        }}
      >
        {subtitle}
      </span>
    </div>
  );
}

function CellView({ cell, width }: { cell: Cell; width: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width,
        flexShrink: 0,
      }}
    >
      {cell.kind === 'check' ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            backgroundColor: 'var(--color-success-tint)',
            borderRadius: 9999,
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12L10 17L19 7" stroke="var(--color-success)" strokeWidth={3} />
          </svg>
        </span>
      ) : cell.kind === 'cross' ? (
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M5 5L19 19M19 5L5 19"
            stroke="var(--color-text-tertiary)"
            strokeWidth={2.5}
          />
        </svg>
      ) : (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: cell.color ?? 'var(--color-text-tertiary)',
          }}
        >
          {cell.text}
        </span>
      )}
    </div>
  );
}
