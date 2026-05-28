import { Button } from '@sparx/ui';
import { Container, Display, EyebrowBadge, Spark } from './primitives';

const METRICS = [
  { value: '5 minutes', subtitle: 'average time-to-live' },
  { value: '8 modules', accent: '#6366F1', subtitle: 'activate any combination' },
  { value: '$26K /yr saved', accent: '#6366F1', subtitle: 'average vs Shopify + HubSpot stack' },
  { value: '99.95% uptime', accent: '#6366F1', subtitle: '99.99% on Enterprise' },
  { value: 'MCP', spark: '#EC4899', subtitle: 'first commerce platform' },
] as const;

export function FinalCta() {
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
        <div
          className="mkt-stack-on-tablet mkt-align-end-on-desktop"
          style={{
            justifyContent: 'space-between',
            gap: '40px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', maxWidth: '920px' }}>
            <EyebrowBadge color="#818CF8" background="#1E1B4B" text="#818CF8">
              Ready when you are
            </EyebrowBadge>
            <Display size={104} lineHeight={96} color="#FFFFFF">
              Light the spark
              <Spark />
            </Display>
            <p
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '20px',
                lineHeight: '32px',
                color: '#A1A1AA',
                maxWidth: '640px',
                margin: 0,
              }}
            >
              Sign up free. Pick the modules you need. Be live before the kettle boils. No card, no
              contract, no upgrade lock-in.
            </p>
          </div>

          <div
            className="mkt-align-end-on-desktop"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              alignItems: 'flex-start',
            }}
          >
            <Button size="xl" variant="primary">
              Start your store →
            </Button>
            <Button
              size="xl"
              variant="secondary"
              style={{
                backgroundColor: 'transparent',
                borderColor: '#2A2A2A',
                color: '#FFFFFF',
              }}
            >
              Book a 20-min call
            </Button>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: '#52525B',
                paddingTop: '8px',
              }}
            >
              $0 to start · Cancel any time
            </span>
          </div>
        </div>

        <div
          className="mkt-cluster"
          style={{
            justifyContent: 'space-between',
            paddingTop: '40px',
            borderTop: '1px solid #1A1A1A',
            gap: '40px',
            rowGap: '24px',
          }}
        >
          {METRICS.map((m) => (
            <div key={m.subtitle} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  fontSize: '22px',
                  letterSpacing: '-0.015em',
                  color: '#FFFFFF',
                }}
              >
                {(() => {
                  if ('accent' in m && m.accent) {
                    const parts = m.value.split(' ');
                    return (
                      <>
                        {parts[0]}
                        <span style={{ color: m.accent }}> {parts.slice(1).join(' ')}</span>
                      </>
                    );
                  }
                  if ('spark' in m && m.spark) {
                    return (
                      <>
                        {m.value}
                        <Spark color={m.spark} />
                      </>
                    );
                  }
                  return m.value;
                })()}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontSize: '12px',
                  color: '#52525B',
                }}
              >
                {m.subtitle}
              </span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
