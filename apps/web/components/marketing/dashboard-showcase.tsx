import { Section, SectionHeader, Wordmark } from './primitives';

const SIDEBAR_MODULES = [
  { color: '#6366F1', label: 'Storefront' },
  { color: '#F97316', label: 'Commerce', active: true, badge: '12' },
  { color: '#14B8A6', label: 'CMS' },
  { color: '#06B6D4', label: 'CRM' },
  { color: '#0EA5E9', label: 'Email' },
  { color: '#475569', label: 'B2B', badge: '3' },
  { color: '#EC4899', label: 'AI / MCP' },
  { color: '#10B981', label: 'Dropship' },
] as const;

const KPI = [
  { stripe: '#F97316', label: 'Revenue', value: '$48,210', delta: '+18.4%', deltaColor: '#10B981' },
  { stripe: '#F97316', label: 'Orders', value: '312', delta: '+22 today', deltaColor: '#10B981' },
  {
    stripe: '#06B6D4',
    label: 'Customers',
    value: '1,847',
    delta: '+34 new',
    deltaColor: '#10B981',
  },
  {
    stripe: '#475569',
    label: 'Open quotes',
    value: '9',
    delta: '3 awaiting reply',
    deltaColor: '#52525B',
  },
] as const;

const ORDERS = [
  {
    id: '#SPX-4821',
    name: 'Ranchero Trucking Co.',
    sub: 'Fleet · Net 30',
    module: { label: 'B2B', tint: '#F1F5F9', dot: '#475569', text: '#334155' },
    status: { label: 'Paid', dot: '#10B981' },
    total: '$4,820.00',
  },
  {
    id: '#SPX-4820',
    name: 'Marisa Webb',
    sub: 'Retail · returning',
    module: { label: 'Commerce', tint: '#FFF7ED', dot: '#F97316', text: '#C2410C' },
    status: { label: 'Paid', dot: '#10B981' },
    total: '$348.50',
  },
  {
    id: '#SPX-4819',
    name: 'Apex Outfitters',
    sub: 'Dropship · supplier routing',
    module: { label: 'Dropship', tint: '#ECFDF5', dot: '#10B981', text: '#065F46' },
    status: { label: 'Routing', dot: '#F59E0B' },
    total: '$1,290.00',
  },
  {
    id: '#SPX-4818',
    name: 'Halcyon & Reed',
    sub: 'Wholesale · PO 8841',
    module: { label: 'B2B', tint: '#F1F5F9', dot: '#475569', text: '#334155' },
    status: { label: 'Net 30', dot: '#52525B' },
    total: '$12,400.00',
  },
] as const;

export function DashboardShowcase() {
  return (
    <Section surface="surface" padding="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
        <SectionHeader
          eyebrow="The dashboard"
          headline={
            <>
              One pane of glass.{' '}
              <span style={{ color: 'var(--color-text-tertiary)' }}>Every module visible.</span>
            </>
          }
          lede={
            <>
              Sparx is one URL, one login, one sidebar. Each active module gets a colored nav item
              and a 3px stripe on its cards — you always know where you are.
            </>
          }
        />

        <div
          style={{
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            margin: '0 calc(var(--gutter-page) * -1)',
            padding: '0 var(--gutter-page)',
          }}
        >
          <div
            style={{
              border: '1px solid var(--color-border-default)',
              borderRadius: '12px 12px 0 0',
              overflow: 'hidden',
              backgroundColor: 'var(--color-bg-surface)',
              minWidth: '960px',
            }}
          >
            <BrowserChrome />
            <div
              style={{
                display: 'flex',
                alignItems: 'stretch',
                minHeight: '640px',
                backgroundColor: 'var(--color-bg-page)',
              }}
            >
              <Sidebar />
              <MainPanel />
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function BrowserChrome() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 20px',
        backgroundColor: 'var(--color-bg-subtle)',
        borderBottom: '1px solid var(--color-border-default)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
        <span style={{ width: 11, height: 11, borderRadius: 9999, backgroundColor: '#FF5F57' }} />
        <span style={{ width: 11, height: 11, borderRadius: 9999, backgroundColor: '#FEBC2E' }} />
        <span style={{ width: 11, height: 11, borderRadius: 9999, backgroundColor: '#28C840' }} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-default)',
          borderRadius: '6px',
          flex: 1,
          maxWidth: '520px',
          marginLeft: '24px',
        }}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 1L3 5V11C3 16 7 21 12 23C17 21 21 16 21 11V5L12 1Z"
            stroke="var(--color-text-secondary)"
            strokeWidth={2}
          />
        </svg>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--color-text-secondary)',
          }}
        >
          app.sparx.works/dashboard
        </span>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '240px',
        backgroundColor: 'var(--color-bg-surface)',
        borderRight: '1px solid var(--color-border-default)',
        padding: '24px 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '4px 8px 24px 8px',
          borderBottom: '1px solid #F4F4F5',
        }}
      >
        <Wordmark size={18} />
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--color-text-tertiary)',
            paddingLeft: '6px',
            borderLeft: '1px solid var(--color-border-default)',
          }}
        >
          Gillett Diesel
        </span>
      </div>

      <SidebarSection title="Overview">
        <SidebarItem icon={<HomeIcon />} label="Home" />
        <SidebarItem icon={<ActivityIcon />} label="Activity" />
      </SidebarSection>

      <SidebarSection title="Modules">
        {SIDEBAR_MODULES.map((m) => (
          <SidebarItem
            key={m.label}
            dot={m.color}
            label={m.label}
            active={'active' in m && m.active}
            badge={'badge' in m ? m.badge : undefined}
          />
        ))}
      </SidebarSection>
    </aside>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '20px' }}>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 500,
          fontSize: '10px',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          padding: '0 8px 8px 8px',
        }}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

function SidebarItem({
  icon,
  dot,
  label,
  active,
  badge,
}: {
  icon?: React.ReactNode;
  dot?: string;
  label: string;
  active?: boolean;
  badge?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '7px 8px',
        borderRadius: '6px',
        backgroundColor: active ? '#FFF7ED' : 'transparent',
      }}
    >
      {icon}
      {dot ? (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 9999,
            backgroundColor: dot,
            flexShrink: 0,
          }}
        />
      ) : null}
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: active ? 500 : 400,
          fontSize: '13px',
          color: active ? '#C2410C' : 'var(--color-text-secondary)',
        }}
      >
        {label}
      </span>
      {badge ? (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: active ? '#C2410C' : 'var(--color-text-tertiary)',
            marginLeft: 'auto',
          }}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function HomeIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={3} y={3} width={7} height={7} stroke="var(--color-text-secondary)" strokeWidth={2} />
      <rect
        x={14}
        y={3}
        width={7}
        height={7}
        stroke="var(--color-text-secondary)"
        strokeWidth={2}
      />
      <rect
        x={3}
        y={14}
        width={7}
        height={7}
        stroke="var(--color-text-secondary)"
        strokeWidth={2}
      />
      <rect
        x={14}
        y={14}
        width={7}
        height={7}
        stroke="var(--color-text-secondary)"
        strokeWidth={2}
      />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 12L6 6L18 6L21 12L21 20H3L3 12Z"
        stroke="var(--color-text-secondary)"
        strokeWidth={2}
      />
    </svg>
  );
}

function MainPanel() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        padding: '28px 32px',
        gap: '24px',
        backgroundColor: 'var(--color-bg-page)',
      }}
    >
      <PageHead />
      <KpiRow />
      <OrdersTable />
    </div>
  );
}

function PageHead() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              backgroundColor: '#FFF7ED',
              borderRadius: '9999px',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 9999, backgroundColor: '#F97316' }} />
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: '10px',
                letterSpacing: '0.05em',
                color: '#C2410C',
                textTransform: 'uppercase',
              }}
            >
              Commerce
            </span>
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            / Orders
          </span>
        </div>
        <h3
          style={{
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: '22px',
            letterSpacing: '-0.02em',
            color: 'var(--color-text-primary)',
            margin: 0,
          }}
        >
          Orders
        </h3>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            padding: '7px 12px',
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-default)',
            borderRadius: '6px',
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--color-text-secondary)',
          }}
        >
          Last 30 days
        </span>
        <span
          style={{
            padding: '7px 12px',
            backgroundColor: '#0A0A0A',
            borderRadius: '6px',
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            fontSize: '12px',
            color: '#FFFFFF',
          }}
        >
          + New order
        </span>
      </div>
    </div>
  );
}

function KpiRow() {
  return (
    <div style={{ display: 'flex', gap: '14px' }}>
      {KPI.map((k) => (
        <div
          key={k.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '18px',
            backgroundColor: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-default)',
            borderTop: `3px solid ${k.stripe}`,
            borderRadius: '8px',
            gap: '6px',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: '10px',
              letterSpacing: '0.08em',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
            }}
          >
            {k.label}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: '24px',
              letterSpacing: '-0.02em',
              color: 'var(--color-text-primary)',
            }}
          >
            {k.value}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: k.deltaColor,
            }}
          >
            {k.delta}
          </span>
        </div>
      ))}
    </div>
  );
}

function OrdersTable() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border-default)',
        borderTop: '3px solid #F97316',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 18px',
          backgroundColor: 'var(--color-bg-page)',
          borderBottom: '1px solid var(--color-border-default)',
          gap: '14px',
        }}
      >
        {['Order', 'Customer', 'Module', 'Status', 'Total'].map((h, i) => (
          <span
            key={h}
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: '10px',
              letterSpacing: '0.08em',
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              width: i === 1 ? undefined : i === 2 ? '110px' : '90px',
              flex: i === 1 ? 1 : undefined,
              flexShrink: 0,
              textAlign: i === 4 ? 'right' : 'left',
            }}
          >
            {h}
          </span>
        ))}
      </div>
      {ORDERS.map((o, i) => (
        <div
          key={o.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 18px',
            gap: '14px',
            borderBottom: i === ORDERS.length - 1 ? undefined : '1px solid #F4F4F5',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
              width: '90px',
              flexShrink: 0,
            }}
          >
            {o.id}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 }}>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: '13px',
                color: 'var(--color-text-primary)',
              }}
            >
              {o.name}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '11px',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {o.sub}
            </span>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              backgroundColor: o.module.tint,
              borderRadius: '9999px',
              width: 'fit-content',
            }}
          >
            <span
              style={{ width: 6, height: 6, borderRadius: 9999, backgroundColor: o.module.dot }}
            />
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: '10px',
                letterSpacing: '0.05em',
                color: o.module.text,
                textTransform: 'uppercase',
              }}
            >
              {o.module.label}
            </span>
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              width: '90px',
              flexShrink: 0,
            }}
          >
            <span
              style={{ width: 6, height: 6, borderRadius: 9999, backgroundColor: o.status.dot }}
            />
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                color: 'var(--color-text-primary)',
              }}
            >
              {o.status.label}
            </span>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 500,
              fontSize: '13px',
              color: 'var(--color-text-primary)',
              width: '90px',
              textAlign: 'right',
              flexShrink: 0,
            }}
          >
            {o.total}
          </span>
        </div>
      ))}
    </div>
  );
}
