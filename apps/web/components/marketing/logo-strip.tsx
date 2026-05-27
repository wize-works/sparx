import { Container, Eyebrow } from './primitives';

const LOGOS = [
  { name: 'Gillett Diesel' },
  { name: 'Northwind Supply' },
  { name: 'Pacific Forge' },
  { name: 'Halcyon & Reed' },
  { name: 'Apex Outfitters' },
  { name: 'Meridian Wholesale' },
] as const;

export function LogoStrip() {
  return (
    <section
      style={{
        paddingTop: '40px',
        paddingBottom: '40px',
        paddingLeft: 'var(--gutter-page)',
        paddingRight: 'var(--gutter-page)',
        backgroundColor: 'var(--color-bg-surface)',
        borderTop: '1px solid var(--color-border-default)',
        borderBottom: '1px solid var(--color-border-default)',
      }}
    >
      <Container style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Eyebrow>Operating live on Sparx</Eyebrow>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--color-text-tertiary)',
          }}
        >
          — and growing
        </span>
      </div>
      <div
        className="mkt-cluster"
        style={{
          justifyContent: 'space-between',
          gap: '32px',
          rowGap: '20px',
        }}
      >
        {LOGOS.map((logo, i) => (
          <div
            key={logo.name}
            style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            <LogoMark index={i} />
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: '18px',
                letterSpacing: '-0.02em',
                color: 'var(--color-text-primary)',
                whiteSpace: 'nowrap',
              }}
            >
              {logo.name}
            </span>
          </div>
        ))}
      </div>
      </Container>
    </section>
  );
}

/** Decorative SVG marks. Six geometric variants — placeholder customer brands. */
function LogoMark({ index }: { index: number }) {
  const fill = 'var(--color-text-primary)';
  switch (index % 6) {
    case 0:
      return (
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M3 12L8 7L13 12L8 17L3 12Z" fill={fill} />
          <circle cx={17} cy={12} r={3} fill={fill} />
        </svg>
      );
    case 1:
      return (
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x={3} y={3} width={8} height={8} fill={fill} />
          <rect x={13} y={3} width={8} height={8} fill={fill} opacity={0.4} />
          <rect x={3} y={13} width={8} height={8} fill={fill} opacity={0.4} />
          <rect x={13} y={13} width={8} height={8} fill={fill} />
        </svg>
      );
    case 2:
      return (
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2L22 8V16L12 22L2 16V8L12 2Z"
            stroke={fill}
            strokeWidth={2}
            fill="none"
          />
        </svg>
      );
    case 3:
      return (
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx={12} cy={12} r={9} stroke={fill} strokeWidth={2} fill="none" />
          <circle cx={12} cy={12} r={3} fill={fill} />
        </svg>
      );
    case 4:
      return (
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 20L12 4L20 20H4Z" fill={fill} />
        </svg>
      );
    default:
      return (
        <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x={3} y={9} width={18} height={6} fill={fill} />
          <rect x={9} y={3} width={6} height={18} fill={fill} />
        </svg>
      );
  }
}
