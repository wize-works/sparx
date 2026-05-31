import { Eyebrow, Wordmark } from './primitives';

interface FooterLink {
  label: string;
  href: string;
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Modules',
    links: [
      { label: 'Storefront', href: '/storefront' },
      { label: 'Commerce', href: '/commerce' },
      { label: 'CMS', href: '/cms' },
      { label: 'CRM', href: '/crm' },
      { label: 'Email', href: '/email' },
      { label: 'B2B / Wholesale', href: '/b2b' },
      { label: 'AI / MCP', href: '/ai' },
      { label: 'Dropship', href: '/dropship' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { label: 'Pricing', href: '/#pricing' },
      { label: 'Themes', href: '/themes' },
      { label: 'Marketplace', href: '/marketplace' },
      { label: 'Managed hosting', href: '/hosting' },
      { label: 'Enterprise', href: '/enterprise' },
      { label: 'Migration tools', href: '/migrate' },
      { label: 'Changelog', href: '/changelog' },
    ],
  },
  {
    title: 'Developers',
    // Developer portal lives on sparx.software per docs/domains.md.
    links: [
      { label: 'API reference', href: 'https://sparx.software/api' },
      { label: 'GraphQL schema', href: 'https://sparx.software/graphql' },
      { label: 'MCP server spec', href: 'https://sparx.software/mcp' },
      { label: 'Webhook events', href: 'https://sparx.software/webhooks' },
      { label: 'Storefront SDK', href: 'https://sparx.software/sdk' },
      { label: 'Self-hosting guide', href: 'https://sparx.software/self-host' },
      { label: 'Open source', href: '/open-source' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About WizeWorks', href: '/about' },
      { label: 'Customers', href: '/#customers' },
      { label: 'Brand', href: '/brand' },
      { label: 'Press', href: '/press' },
      { label: 'Careers', href: '/careers' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal & trust',
    links: [
      { label: 'Terms of service', href: '/legal/terms' },
      { label: 'Privacy policy', href: '/legal/privacy' },
      { label: 'Data processing', href: '/legal/dpa' },
      { label: 'Security & SOC 2', href: '/security' },
      { label: 'Status & SLA', href: 'https://status.sparx.works' },
      { label: 'Acceptable use', href: '/legal/aup' },
    ],
  },
];

const DOMAINS = [
  { name: 'sparx.works', color: '#6366F1', primary: true },
  { name: 'sparx.zone', color: '#6366F1' },
  { name: 'sparxcms.com', color: '#14B8A6' },
  { name: 'sparxcrm.com', color: '#06B6D4' },
  { name: 'sparxemail.com', color: '#0EA5E9' },
  { name: 'sparxb2b.com', color: '#475569' },
  { name: 'sparx.email', color: '#A1A1AA' },
  { name: 'sparx.host', color: '#A1A1AA' },
  { name: 'sparx.software', color: '#A1A1AA' },
  { name: 'sparx.exchange', color: '#A1A1AA' },
  { name: 'sparx.market', color: '#A1A1AA' },
] as const;

export function Footer() {
  return (
    <footer
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '48px',
        paddingTop: '64px',
        paddingBottom: '32px',
        paddingLeft: 'var(--gutter-page)',
        paddingRight: 'var(--gutter-page)',
        backgroundColor: 'var(--color-bg-page)',
        borderTop: '1px solid var(--color-border-default)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '40px 32px',
          alignItems: 'flex-start',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            flex: '1 1 280px',
            minWidth: '240px',
            maxWidth: '340px',
          }}
        >
          <Wordmark size={24} />
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '13px',
              lineHeight: '22px',
              color: 'var(--color-text-secondary)',
              margin: 0,
            }}
          >
            Modular commerce OS by WizeWorks. Built in Visalia, California. Operating worldwide.
          </p>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 12px',
              backgroundColor: 'var(--color-success-tint)',
              borderRadius: '9999px',
              width: 'fit-content',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 9999,
                backgroundColor: 'var(--color-success)',
              }}
            />
            <Eyebrow color="var(--color-success-text)">All systems operational</Eyebrow>
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            status.sparx.works
          </span>
        </div>

        {COLUMNS.map((col) => (
          <div
            key={col.title}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              flex: '1 1 140px',
              minWidth: '140px',
            }}
          >
            <Eyebrow color="var(--color-text-primary)">{col.title}</Eyebrow>
            {col.links.map((link) => {
              const external = link.href.startsWith('http');
              return (
                <a
                  key={link.label}
                  href={link.href}
                  {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    color: 'var(--color-text-secondary)',
                    textDecoration: 'none',
                  }}
                >
                  {link.label}
                  {external ? (
                    <span
                      aria-hidden
                      style={{ color: 'var(--color-text-tertiary)', marginLeft: '4px' }}
                    >
                      ↗
                    </span>
                  ) : null}
                </a>
              );
            })}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          paddingTop: '32px',
          borderTop: '1px solid var(--color-border-default)',
        }}
      >
        <Eyebrow>The Sparx domain network</Eyebrow>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {DOMAINS.map((d) => (
            <span key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: 6, height: 6, borderRadius: 9999, backgroundColor: d.color }} />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color:
                    'primary' in d && d.primary
                      ? 'var(--color-text-primary)'
                      : 'var(--color-text-secondary)',
                }}
              >
                {d.name}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div
        className="mkt-cluster"
        style={{
          justifyContent: 'space-between',
          paddingTop: '24px',
          borderTop: '1px solid var(--color-border-default)',
          rowGap: '12px',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '12px',
            color: 'var(--color-text-tertiary)',
          }}
        >
          © 2026 WizeWorks, Inc. · Visalia, California · Sparx is a registered trademark of
          WizeWorks.
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            v1.0 · 2026-05-27
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--color-text-secondary)',
            }}
          >
            EN · USD
          </span>
        </div>
      </div>
    </footer>
  );
}
