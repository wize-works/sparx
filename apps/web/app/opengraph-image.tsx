import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Sparx — Commerce, ignited.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const MODULE_DOTS = [
  '#6366F1', // storefront
  '#F97316', // commerce
  '#14B8A6', // cms
  '#06B6D4', // crm
  '#0EA5E9', // email
  '#475569', // b2b
  '#EC4899', // ai
  '#10B981', // dropship
] as const;

export default function Image() {
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
        {/* Top: wordmark + tag */}
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
              border: '1px solid #1E1B4B',
              borderRadius: 9999,
              backgroundColor: '#0F0B2E',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 9999,
                backgroundColor: '#818CF8',
              }}
            />
            <span
              style={{
                fontWeight: 500,
                fontSize: 16,
                letterSpacing: '0.08em',
                color: '#818CF8',
                textTransform: 'uppercase',
              }}
            >
              Modular Commerce OS
            </span>
          </div>
        </div>

        {/* Middle: big headline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontWeight: 500,
              fontSize: 160,
              letterSpacing: '-0.035em',
              lineHeight: 1,
              color: '#FFFFFF',
            }}
          >
            <div style={{ display: 'flex' }}>Commerce,</div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <span>ignited</span>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9999,
                  backgroundColor: '#6366F1',
                  marginLeft: 4,
                  marginBottom: 14,
                }}
              />
            </div>
          </div>
          <span
            style={{
              fontSize: 28,
              lineHeight: 1.4,
              color: '#A1A1AA',
              maxWidth: 920,
            }}
          >
            Storefront, CRM, CMS, email, B2B, and AI — one platform, one bill,
            one data layer. Live in five minutes.
          </span>
        </div>

        {/* Bottom: module dots + footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 28,
            borderTop: '1px solid #1A1A1A',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span
              style={{
                fontWeight: 500,
                fontSize: 14,
                letterSpacing: '0.08em',
                color: '#52525B',
                textTransform: 'uppercase',
              }}
            >
              8 modules
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {MODULE_DOTS.map((color) => (
                <div
                  key={color}
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 9999,
                    backgroundColor: color,
                  }}
                />
              ))}
            </div>
          </div>
          <span style={{ fontSize: 18, color: '#52525B' }}>sparx.works</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
