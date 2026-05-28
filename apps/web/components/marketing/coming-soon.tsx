import { Button } from '@sparx/ui';
import { Container, Display, Eyebrow, EyebrowBadge, Spark } from './primitives';

/**
 * Placeholder page for marketing surfaces that exist as routes but don't have
 * real content yet (e.g. /press, /careers, /legal/*). Renders an editorial
 * hero, the page title with a spark, a short description, and a CTA back to
 * the home page. Pair with `robots: { index: false }` in the route metadata
 * so search engines don't surface these stubs.
 */
export function ComingSoon({
  eyebrow,
  title,
  description,
  contact,
}: {
  /** Short uppercase label above the headline — e.g. "Company", "Legal". */
  eyebrow: string;
  /** Page name — gets the spark accent. */
  title: string;
  /** One-sentence description of what this page will eventually hold. */
  description: string;
  /** Optional contact email shown below the CTA. */
  contact?: string;
}) {
  return (
    <section
      style={{
        paddingTop: 'clamp(96px, 12vw, 160px)',
        paddingBottom: 'clamp(96px, 12vw, 160px)',
        paddingLeft: 'var(--gutter-page)',
        paddingRight: 'var(--gutter-page)',
        backgroundColor: 'var(--color-bg-page)',
        minHeight: 'calc(100vh - 80px)',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Container
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
          alignItems: 'flex-start',
        }}
      >
        <EyebrowBadge
          color="var(--sparx-primary)"
          background="var(--sparx-primary-tint)"
          text="#4338CA"
        >
          Coming soon
        </EyebrowBadge>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Eyebrow color="var(--color-text-tertiary)">{eyebrow}</Eyebrow>
          <Display as="h1" size={88} lineHeight={84}>
            {title}
            <Spark />
          </Display>
        </div>

        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '18px',
            lineHeight: '30px',
            color: 'var(--color-text-secondary)',
            maxWidth: '640px',
            margin: 0,
          }}
        >
          {description}
        </p>

        <div className="mkt-cluster" style={{ gap: '12px', paddingTop: '8px' }}>
          <a href="/">
            <Button size="lg" style={{ backgroundColor: '#0A0A0A' }}>
              ← Back to sparx.works
            </Button>
          </a>
          {contact ? (
            <a
              href={`mailto:${contact}`}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                color: 'var(--color-text-tertiary)',
                textDecoration: 'none',
                padding: '12px 0',
              }}
            >
              Or email {contact}
            </a>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
