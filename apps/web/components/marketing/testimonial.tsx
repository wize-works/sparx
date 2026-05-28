import { Container, Eyebrow } from './primitives';

const METRICS = [
  { label: 'Annual savings', value: '$26,400' },
  { label: 'Migration time', value: '14 days' },
  { label: 'Fleet accounts', value: '214 units' },
  { label: 'Modules active', value: 'All 8' },
] as const;

export function Testimonial() {
  return (
    <section
      id="customers"
      style={{
        paddingTop: 'var(--section-py-xl)',
        paddingBottom: 'var(--section-py-xl)',
        paddingLeft: 'var(--gutter-page)',
        paddingRight: 'var(--gutter-page)',
        backgroundColor: 'var(--color-bg-surface)',
        borderTop: '1px solid var(--color-border-default)',
        scrollMarginTop: '80px',
      }}
    >
      <Container style={{ display: 'flex', flexDirection: 'column', gap: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Eyebrow>Customer · Enterprise</Eyebrow>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            Case study →
          </span>
        </div>

        <div
          className="mkt-stack-on-tablet"
          style={{
            gap: '48px',
            alignItems: 'flex-start',
            padding: '24px 0',
          }}
        >
          <blockquote
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
              fontSize: 'clamp(26px, 3.4vw, 46px)',
              letterSpacing: '-0.025em',
              lineHeight: 1.3,
              color: 'var(--color-text-primary)',
              margin: 0,
              flex: 1,
            }}
          >
            &ldquo;We were paying{' '}
            <span style={{ color: 'var(--color-text-tertiary)' }}>$35,400 a year</span>
            {
              ' for Shopify + HubSpot and still couldn’t ask a simple question across both. We moved to Sparx in '
            }
            <span style={{ color: 'var(--sparx-primary)' }}>two weeks</span>
            {'. The fleet module alone paid for the migration.”'}
          </blockquote>

          <aside
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '32px',
              width: '340px',
              maxWidth: '100%',
              flexShrink: 0,
              paddingTop: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 48,
                  height: 48,
                  backgroundColor: '#0A0A0A',
                  borderRadius: '9999px',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  fontSize: '18px',
                  letterSpacing: '-0.02em',
                  color: '#FFFFFF',
                }}
              >
                M
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 500,
                    fontSize: '15px',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  Michael Gillett
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Owner, Gillett Diesel Service
                </span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                paddingTop: '12px',
                borderTop: '1px solid var(--color-border-default)',
              }}
            >
              {METRICS.map((m, i) => (
                <div
                  key={m.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 0',
                    borderBottom: i === METRICS.length - 1 ? undefined : '1px solid #F4F4F5',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: '13px',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {m.label}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 500,
                      fontSize: '15px',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </Container>
    </section>
  );
}
