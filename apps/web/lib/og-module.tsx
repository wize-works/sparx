import { ImageResponse } from 'next/og';
import { type ModuleMeta } from './modules';

// Color map duplicated here so the edge-runtime OG generator doesn't import
// the marketing components (which pull React DOM). Keep in sync with
// MODULE_COLORS in components/marketing/primitives.tsx.
const MODULE_COLORS: Record<
  string,
  { color: string; tint: string; text: string }
> = {
  storefront: { color: '#6366F1', tint: '#EEF2FF', text: '#4338CA' },
  commerce: { color: '#F97316', tint: '#FFF7ED', text: '#C2410C' },
  cms: { color: '#14B8A6', tint: '#F0FDFA', text: '#0F766E' },
  crm: { color: '#06B6D4', tint: '#ECFEFF', text: '#0E7490' },
  email: { color: '#0EA5E9', tint: '#F0F9FF', text: '#0369A1' },
  b2b: { color: '#475569', tint: '#F1F5F9', text: '#334155' },
  ai: { color: '#EC4899', tint: '#FDF2F8', text: '#9D174D' },
  dropship: { color: '#10B981', tint: '#ECFDF5', text: '#065F46' },
};

export const OG_SIZE = { width: 1200, height: 630 } as const;

export function renderModuleOgImage(meta: ModuleMeta) {
  const color = MODULE_COLORS[meta.module]!;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0A0A0A',
          padding: '72px',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
        }}
      >
        {/* Top: wordmark + module badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              fontWeight: 500,
              fontSize: 40,
              color: '#FFFFFF',
              letterSpacing: '-0.03em',
            }}
          >
            <span>Spar</span>
            <span style={{ color: '#6366F1' }}>x</span>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 18px',
              border: `1px solid ${color.color}`,
              borderRadius: 9999,
              backgroundColor: `${color.color}1A`,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 9999,
                backgroundColor: color.color,
              }}
            />
            <span
              style={{
                fontWeight: 500,
                fontSize: 16,
                letterSpacing: '0.08em',
                color: color.color,
                textTransform: 'uppercase',
              }}
            >
              {meta.label}
            </span>
          </div>
        </div>

        {/* Middle: big headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontWeight: 500,
              fontSize: 140,
              letterSpacing: '-0.035em',
              lineHeight: 1,
              color: '#FFFFFF',
            }}
          >
            <div style={{ display: 'flex' }}>{meta.headlinePrimary}</div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <span>{meta.headlineSecondary}</span>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 9999,
                  backgroundColor: color.color,
                  marginLeft: 4,
                  marginBottom: 12,
                }}
              />
            </div>
          </div>
          <span
            style={{
              fontSize: 26,
              lineHeight: 1.4,
              color: '#A1A1AA',
              maxWidth: 920,
            }}
          >
            {meta.description}
          </span>
        </div>

        {/* Bottom: pricing + url */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 28,
            borderTop: '1px solid #1A1A1A',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span
              style={{
                fontWeight: 500,
                fontSize: 14,
                letterSpacing: '0.08em',
                color: '#52525B',
                textTransform: 'uppercase',
              }}
            >
              From
            </span>
            <span
              style={{
                display: 'flex',
                alignItems: 'baseline',
                fontWeight: 500,
                fontSize: 22,
                color: '#FFFFFF',
              }}
            >
              {meta.pricing.modifier ?? ''}
              {meta.pricing.price}
              <span style={{ color: '#52525B', fontSize: 16, marginLeft: 4 }}>
                {meta.pricing.period}
              </span>
            </span>
          </div>
          <span style={{ fontSize: 18, color: '#52525B' }}>
            sparx.works/{meta.slug}
          </span>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
