import { Button } from '@sparx/ui';
import { Container, Display, Dot, Eyebrow, Spark } from './primitives';

const MODULE_DOTS = [
  '#6366F1',
  '#F97316',
  '#14B8A6',
  '#06B6D4',
  '#0EA5E9',
  '#475569',
  '#EC4899',
  '#10B981',
] as const;

const METRICS = [
  { value: '5 min', subtitle: 'to a live store' },
  { value: '$49', valueSuffix: '/mo', subtitle: 'starting price' },
  { value: '1', valueSuffix: ' bill', subtitle: 'replaces 4–6 tools' },
  { value: 'MCP', valueSpark: true, subtitle: 'native AI access' },
] as const;

export function Hero() {
  return (
    <section
      style={{
        paddingTop: 'clamp(64px, 11vw, 120px)',
        paddingBottom: 'var(--section-py-lg)',
        paddingLeft: 'var(--gutter-page)',
        paddingRight: 'var(--gutter-page)',
        backgroundColor: 'var(--color-bg-page)',
      }}
    >
      <Container style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Dot />
          <Eyebrow>Sparx Platform · v1.0</Eyebrow>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '1100px' }}>
          <Display as="h1" size={120} lineHeight={104}>
            Commerce,
          </Display>
          <Display as="h1" size={120} lineHeight={104}>
            ignited<Spark />
          </Display>
        </div>

        <div
          className="mkt-stack-on-tablet mkt-align-end-on-desktop"
          style={{
            justifyContent: 'space-between',
            gap: '40px',
            maxWidth: '1280px',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 400,
              fontSize: 'clamp(16px, 1.6vw, 20px)',
              lineHeight: 1.55,
              color: 'var(--color-text-secondary)',
              maxWidth: '560px',
              margin: 0,
            }}
          >
            A modular commerce OS. Storefront, CRM, CMS, email, B2B, and AI — one platform, one bill,
            one data layer. Pay only for what you use. Live in five minutes.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="mkt-cluster" style={{ gap: '12px' }}>
              <Button size="lg" style={{ backgroundColor: '#0A0A0A' }}>
                Launch your store
              </Button>
              <Button size="lg" variant="secondary">
                See the platform
              </Button>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--color-text-tertiary)',
              }}
            >
              No credit card · Cancel anytime
            </span>
          </div>
        </div>

        <div
          className="mkt-cluster"
          style={{
            justifyContent: 'space-between',
            paddingTop: '32px',
            marginTop: '32px',
            borderTop: '1px solid var(--color-border-default)',
            gap: '32px',
            rowGap: '24px',
          }}
        >
          <div className="mkt-cluster" style={{ gap: '24px' }}>
            <Eyebrow color="var(--color-text-tertiary)">8 modules</Eyebrow>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {MODULE_DOTS.map((c) => (
                <Dot key={c} color={c} size={10} />
              ))}
            </div>
          </div>
          <div
            className="mkt-cluster"
            style={{ gap: '40px', rowGap: '20px', justifyContent: 'flex-end' }}
          >
            {METRICS.map((m) => (
              <div key={m.subtitle} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 500,
                    fontSize: '24px',
                    letterSpacing: '-0.02em',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {m.value}
                  {'valueSuffix' in m && m.valueSuffix ? (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>{m.valueSuffix}</span>
                  ) : null}
                  {'valueSpark' in m && m.valueSpark ? <Spark color="#EC4899" /> : null}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12px',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {m.subtitle}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
