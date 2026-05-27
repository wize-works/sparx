import { Button } from '@sparx/ui';
import {
  Container,
  Display,
  Dot,
  Eyebrow,
  EyebrowBadge,
  getModuleColor,
  Section,
  Spark,
} from './primitives';
import { type ModuleMeta } from '@/lib/modules';

/**
 * Reusable per-module marketing page. Each module's route
 * (`app/storefront/page.tsx`, etc.) renders this with its `ModuleMeta`.
 * The module color is pulled from tokens via `getModuleColor()` so the
 * hero accent, eyebrow badge, feature card stripes, and pricing chip
 * stay consistent with the rest of the brand.
 */
export function ModulePage({ meta }: { meta: ModuleMeta }) {
  const color = getModuleColor(meta.module);
  return (
    <>
      <ModuleHero meta={meta} color={color} />
      <ModuleFeatures meta={meta} color={color} />
      <ModulePricingStrip meta={meta} color={color} />
      <ModuleCta meta={meta} color={color} />
    </>
  );
}

type ModuleColor = ReturnType<typeof getModuleColor>;

/** Strip any suffix after a middle-dot — "B2B · Wholesale · Fleet" → "B2B". */
function shortLabel(label: string): string {
  const head = label.split('·')[0];
  return head ? head.trim() : label;
}

function ModuleHero({ meta, color }: { meta: ModuleMeta; color: ModuleColor }) {
  return (
    <section
      style={{
        paddingTop: 'clamp(56px, 9vw, 96px)',
        paddingBottom: 'var(--section-py-lg)',
        paddingLeft: 'var(--gutter-page)',
        paddingRight: 'var(--gutter-page)',
        backgroundColor: 'var(--color-bg-page)',
      }}
    >
      <Container style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
        <EyebrowBadge color={color.color} background={color.tint} text={color.text}>
          {meta.label}
        </EyebrowBadge>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '1100px' }}>
          <Display as="h1" size={104} lineHeight={96}>
            {meta.headlinePrimary}
          </Display>
          <Display as="h1" size={104} lineHeight={96}>
            {meta.headlineSecondary}
            <Spark color={color.color} />
          </Display>
        </div>

        <div
          className="mkt-stack-on-tablet mkt-align-end-on-desktop"
          style={{ justifyContent: 'space-between', gap: '40px', maxWidth: '1280px' }}
        >
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 400,
              fontSize: 'clamp(16px, 1.6vw, 20px)',
              lineHeight: 1.55,
              color: 'var(--color-text-secondary)',
              maxWidth: '640px',
              margin: 0,
            }}
          >
            {meta.lede}
          </p>

          <div className="mkt-align-end-on-desktop" style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'flex-start' }}>
            <div className="mkt-cluster" style={{ gap: '12px' }}>
              <Button size="lg" style={{ backgroundColor: '#0A0A0A' }}>
                Start free
              </Button>
              <Button size="lg" variant="secondary">
                See pricing
              </Button>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {meta.marketingDomain ? `${meta.marketingDomain} · ` : ''}
              No credit card · Cancel anytime
            </span>
          </div>
        </div>
      </Container>
    </section>
  );
}

function ModuleFeatures({ meta, color }: { meta: ModuleMeta; color: ModuleColor }) {
  return (
    <Section surface="surface" padding="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '64px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
          <Eyebrow color={color.color}>What it does</Eyebrow>
          <Display size={56} lineHeight={60}>
            Every part of {shortLabel(meta.label)}
            <Spark color={color.color} />
          </Display>
        </div>

        <div className="mkt-grid-3-2-1">
          {meta.features.map((f) => (
            <div
              key={f.number}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '32px',
                backgroundColor: 'var(--color-bg-page)',
                border: '1px solid var(--color-border-default)',
                borderTop: `3px solid ${color.color}`,
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
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    backgroundColor: color.tint,
                    borderRadius: '6px',
                  }}
                >
                  <Dot color={color.color} size={8} />
                </span>
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
                  fontSize: '14px',
                  lineHeight: '22px',
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

function ModulePricingStrip({ meta, color }: { meta: ModuleMeta; color: ModuleColor }) {
  return (
    <Section padding="lg">
      <div
        className="mkt-stack-on-tablet"
        style={{
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '40px',
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-default)',
          borderTop: `3px solid ${color.color}`,
          borderRadius: '12px',
          gap: '32px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
          <Eyebrow color={color.color}>Pricing</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            {meta.pricing.modifier ? (
              <span
                style={{
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  fontSize: '40px',
                  letterSpacing: '-0.02em',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {meta.pricing.modifier}
              </span>
            ) : null}
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 500,
                fontSize: '56px',
                letterSpacing: '-0.025em',
                color: 'var(--color-text-primary)',
              }}
            >
              {meta.pricing.price}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '16px',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {meta.pricing.period}
            </span>
          </div>
          <p
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: '14px',
              lineHeight: '22px',
              color: 'var(--color-text-secondary)',
              margin: 0,
              maxWidth: '640px',
            }}
          >
            {meta.pricing.bundleNote}
          </p>
        </div>
        <div className="mkt-cluster" style={{ gap: '12px' }}>
          <a href="/#pricing">
            <Button size="lg" variant="secondary">
              See all plans →
            </Button>
          </a>
          <Button size="lg" style={{ backgroundColor: '#0A0A0A' }}>
            Activate {shortLabel(meta.label)}
          </Button>
        </div>
      </div>
    </Section>
  );
}

function ModuleCta({ meta, color }: { meta: ModuleMeta; color: ModuleColor }) {
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
      <Container
        style={{ display: 'flex', flexDirection: 'column', gap: '48px', alignItems: 'flex-start' }}
      >
        <EyebrowBadge color={color.color} background="#1A1A1A" text={color.color}>
          {meta.label}
        </EyebrowBadge>
        <Display size={88} lineHeight={84} color="#FFFFFF">
          Ready to go
          <Spark color={color.color} />
        </Display>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '18px',
            lineHeight: '30px',
            color: '#A1A1AA',
            maxWidth: '640px',
            margin: 0,
          }}
        >
          Activate {shortLabel(meta.label)} in one click. No migration, no consultant, no
          contract. Turn it back off any time — your data stays.
        </p>
        <div className="mkt-cluster" style={{ gap: '12px' }}>
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
            Talk to sales
          </Button>
        </div>
      </Container>
    </section>
  );
}
