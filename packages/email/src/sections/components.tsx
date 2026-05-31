import * as React from 'react';
import type { z } from 'zod';
import { Column, Img, Link as ReLink, Row, Section, Text } from '@react-email/components';
import {
  AbandonedCartConfig,
  ActivePromotionConfig,
  ButtonConfig,
  CollectionGridConfig,
  DividerConfig,
  FeaturedProductsConfig,
  HeadingConfig,
  ImageConfig,
  LatestBlogPostsConfig,
  LoyaltyPointsConfig,
  RecentOrderConfig,
  RecommendedProductsConfig,
  SpacerConfig,
  type CartLineData,
  type ProductCardData,
  type SectionData,
} from '@sparx/email-sections';
import {
  EmailButton,
  EmailDivider,
  EmailHeading,
  EmailParagraph,
  EmailSpacer,
  useBrand,
} from '../components';
import { spacing, typography } from '../components/tokens';

// One React Email component per email section type. Each is a real component
// (rendered as <Comp/>) — NOT called as a function — so `useBrand()` runs inside
// React render under the BrandProvider and picks up the tenant brand. Config is
// re-parsed against its Zod schema (defensive: a section omits itself rather
// than throwing on a malformed config), and a data-bound section returns null
// when its resolved data is empty (the resolver applies onEmpty — docs/31 §7).

export interface SectionRenderProps {
  config: Record<string, unknown>;
  data?: SectionData;
}
export type SectionComponent = React.FC<SectionRenderProps>;

function parsed<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw);
  return r.success ? r.data : schema.parse({});
}

function dataOf<K extends SectionData['kind']>(
  data: SectionData | undefined,
  kind: K
): Extract<SectionData, { kind: K }> | undefined {
  return data?.kind === kind ? (data as Extract<SectionData, { kind: K }>) : undefined;
}

/** First truthy (non-empty) string, '' when none — used where '' must fall
 *  through to the next candidate (so `??` is wrong; it keeps the empty string). */
function firstNonEmpty(...vals: (string | undefined)[]): string {
  for (const v of vals) if (v) return v;
  return '';
}

const SPACER_PX: Record<string, number> = {
  sm: spacing.xs,
  md: spacing.md,
  lg: spacing.lg,
  xl: spacing.xl,
};

// ── Shared sub-atoms ──────────────────────────────────────────────────────

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function ProductGrid({ products, columns }: { products: ProductCardData[]; columns: number }) {
  const brand = useBrand();
  const rows = chunk(products, columns);
  return (
    <>
      {rows.map((row, ri) => (
        <Row key={ri} style={{ marginBottom: spacing.sm }}>
          {row.map((p, ci) => (
            <Column
              key={ci}
              style={{ width: `${100 / columns}%`, verticalAlign: 'top', padding: '0 6px' }}
            >
              <ReLink href={p.url} style={{ textDecoration: 'none', color: brand.foreground }}>
                {p.imageUrl ? (
                  <Img
                    src={p.imageUrl}
                    alt={p.title}
                    width="100%"
                    style={{
                      borderRadius: 8,
                      border: `1px solid ${brand.border}`,
                      marginBottom: 6,
                    }}
                  />
                ) : null}
                <Text
                  style={{
                    ...typography.muted,
                    color: brand.foreground,
                    fontWeight: 600,
                    margin: '0 0 2px',
                  }}
                >
                  {p.title}
                </Text>
                <Text
                  style={{ ...typography.muted, color: brand.primary, fontWeight: 700, margin: 0 }}
                >
                  {p.priceLabel}
                </Text>
              </ReLink>
            </Column>
          ))}
        </Row>
      ))}
    </>
  );
}

function CartTable({ lines, showPrices }: { lines: CartLineData[]; showPrices: boolean }) {
  const brand = useBrand();
  return (
    <>
      {lines.map((l, i) => (
        <Row key={i} style={{ marginBottom: spacing.xs }}>
          {l.imageUrl ? (
            <Column style={{ width: 56, verticalAlign: 'top' }}>
              <Img
                src={l.imageUrl}
                alt={l.title}
                width="48"
                style={{ borderRadius: 6, border: `1px solid ${brand.border}` }}
              />
            </Column>
          ) : null}
          <Column style={{ verticalAlign: 'top' }}>
            <Text
              style={{ ...typography.body, color: brand.foreground, fontWeight: 600, margin: 0 }}
            >
              {l.title}
            </Text>
            <Text style={{ ...typography.muted, color: brand.foreground, margin: '2px 0 0' }}>
              Qty {l.quantity}
            </Text>
          </Column>
          {showPrices && l.priceLabel ? (
            <Column style={{ width: 90, textAlign: 'right', verticalAlign: 'top' }}>
              <Text
                style={{ ...typography.body, color: brand.primary, fontWeight: 700, margin: 0 }}
              >
                {l.priceLabel}
              </Text>
            </Column>
          ) : null}
        </Row>
      ))}
    </>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  const brand = useBrand();
  return (
    <Text
      style={{
        ...typography.muted,
        color: brand.foreground,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: 700,
        margin: `0 0 ${spacing.sm}px`,
      }}
    >
      {children}
    </Text>
  );
}

// ── Static ────────────────────────────────────────────────────────────────

const Heading: SectionComponent = ({ config }) => {
  const c = parsed(HeadingConfig, config);
  if (!c.text) return null;
  return (
    <div style={{ textAlign: c.align }}>
      <EmailHeading level={c.level === 'h2' ? 2 : 1}>{c.text}</EmailHeading>
    </div>
  );
};

const RichText: SectionComponent = ({ data }) => {
  const d = dataOf(data, 'rich-text');
  if (!d?.html) return null;
  return <div dangerouslySetInnerHTML={{ __html: d.html }} />;
};

const ImageBlock: SectionComponent = ({ config, data }) => {
  const c = parsed(ImageConfig, config);
  const src = dataOf(data, 'image')?.src;
  if (!src) return null;
  const img = (
    <Img
      src={src}
      alt={c.alt}
      width={c.width === 'inset' ? '80%' : '100%'}
      style={{ borderRadius: 8, margin: '0 auto' }}
    />
  );
  return (
    <div style={{ textAlign: c.align }}>{c.href ? <ReLink href={c.href}>{img}</ReLink> : img}</div>
  );
};

const ButtonBlock: SectionComponent = ({ config }) => {
  const c = parsed(ButtonConfig, config);
  if (!c.label || !c.href) return null;
  return (
    <div style={{ textAlign: c.align, margin: `${spacing.sm}px 0` }}>
      <EmailButton href={c.href}>{c.label}</EmailButton>
    </div>
  );
};

const Divider: SectionComponent = ({ config }) => {
  const c = parsed(DividerConfig, config);
  if (!c.line) return <EmailSpacer size={SPACER_PX[c.spacing] ?? spacing.md} />;
  return <EmailDivider />;
};

const Spacer: SectionComponent = ({ config }) => {
  const c = parsed(SpacerConfig, config);
  return <EmailSpacer size={SPACER_PX[c.size] ?? spacing.md} />;
};

// ── Dynamic ─────────────────────────────────────────────────────────────────

const FeaturedProducts: SectionComponent = ({ config, data }) => {
  const c = parsed(FeaturedProductsConfig, config);
  const d = dataOf(data, 'products');
  if (!d?.products.length) return null;
  return (
    <Section>
      {c.heading ? <SectionHeading>{c.heading}</SectionHeading> : null}
      <ProductGrid products={d.products.slice(0, c.limit)} columns={c.columns} />
    </Section>
  );
};

const CollectionGrid: SectionComponent = ({ config, data }) => {
  const c = parsed(CollectionGridConfig, config);
  const brand = useBrand();
  const d = dataOf(data, 'collections');
  if (!d?.collections.length) return null;
  const rows = chunk(d.collections, c.columns);
  return (
    <Section>
      {c.heading ? <SectionHeading>{c.heading}</SectionHeading> : null}
      {rows.map((row, ri) => (
        <Row key={ri} style={{ marginBottom: spacing.sm }}>
          {row.map((t, ci) => (
            <Column
              key={ci}
              style={{ width: `${100 / c.columns}%`, padding: '0 6px', verticalAlign: 'top' }}
            >
              <ReLink href={t.url} style={{ textDecoration: 'none', color: brand.foreground }}>
                {t.imageUrl ? (
                  <Img
                    src={t.imageUrl}
                    alt={t.title}
                    width="100%"
                    style={{ borderRadius: 8, marginBottom: 6 }}
                  />
                ) : null}
                <Text
                  style={{
                    ...typography.muted,
                    color: brand.foreground,
                    fontWeight: 600,
                    margin: 0,
                  }}
                >
                  {t.title}
                </Text>
              </ReLink>
            </Column>
          ))}
        </Row>
      ))}
    </Section>
  );
};

const LatestBlogPosts: SectionComponent = ({ config, data }) => {
  const c = parsed(LatestBlogPostsConfig, config);
  const brand = useBrand();
  const d = dataOf(data, 'blog');
  if (!d?.posts.length) return null;
  return (
    <Section>
      {c.heading ? <SectionHeading>{c.heading}</SectionHeading> : null}
      {d.posts.slice(0, c.limit).map((p, i) => (
        <Row key={i} style={{ marginBottom: spacing.sm }}>
          {p.imageUrl ? (
            <Column style={{ width: 96, verticalAlign: 'top' }}>
              <Img src={p.imageUrl} alt={p.title} width="84" style={{ borderRadius: 8 }} />
            </Column>
          ) : null}
          <Column style={{ verticalAlign: 'top' }}>
            <ReLink href={p.url} style={{ textDecoration: 'none' }}>
              <Text
                style={{ ...typography.body, color: brand.foreground, fontWeight: 600, margin: 0 }}
              >
                {p.title}
              </Text>
            </ReLink>
            {c.showExcerpt && p.excerpt ? (
              <Text style={{ ...typography.muted, color: brand.foreground, margin: '2px 0 0' }}>
                {p.excerpt}
              </Text>
            ) : null}
            {p.dateLabel ? (
              <Text
                style={{
                  ...typography.muted,
                  color: brand.foreground,
                  opacity: 0.6,
                  margin: '2px 0 0',
                }}
              >
                {p.dateLabel}
              </Text>
            ) : null}
          </Column>
        </Row>
      ))}
    </Section>
  );
};

const ActivePromotion: SectionComponent = ({ config, data }) => {
  const c = parsed(ActivePromotionConfig, config);
  const promo = dataOf(data, 'promotion')?.promotion;
  if (!promo) return null;
  return (
    <Section>
      <EmailHeading level={2}>{promo.title || c.heading}</EmailHeading>
      {promo.body ? <EmailParagraph>{promo.body}</EmailParagraph> : null}
      {promo.ctaHref && promo.ctaLabel ? (
        <EmailButton href={promo.ctaHref}>{promo.ctaLabel}</EmailButton>
      ) : null}
    </Section>
  );
};

// ── Personalized ─────────────────────────────────────────────────────────────

const AbandonedCart: SectionComponent = ({ config, data }) => {
  const c = parsed(AbandonedCartConfig, config);
  const d = dataOf(data, 'cart');
  if (!d?.lines.length) return null;
  const href = firstNonEmpty(c.ctaHref, d.recoverUrl);
  return (
    <Section>
      {c.heading ? <SectionHeading>{c.heading}</SectionHeading> : null}
      <CartTable lines={d.lines.slice(0, c.maxItems)} showPrices={c.showPrices} />
      {href ? (
        <div style={{ marginTop: spacing.sm }}>
          <EmailButton href={href}>{c.ctaLabel}</EmailButton>
        </div>
      ) : null}
    </Section>
  );
};

const RecommendedProducts: SectionComponent = ({ config, data }) => {
  const c = parsed(RecommendedProductsConfig, config);
  const d = dataOf(data, 'products');
  if (!d?.products.length) return null;
  return (
    <Section>
      {c.heading ? <SectionHeading>{c.heading}</SectionHeading> : null}
      <ProductGrid products={d.products.slice(0, c.limit)} columns={c.columns} />
    </Section>
  );
};

const RecentOrder: SectionComponent = ({ config, data }) => {
  const c = parsed(RecentOrderConfig, config);
  const brand = useBrand();
  const order = dataOf(data, 'order')?.order;
  if (!order) return null;
  return (
    <Section>
      {c.heading ? <SectionHeading>{c.heading}</SectionHeading> : null}
      <Text style={{ ...typography.body, color: brand.foreground, fontWeight: 600, margin: 0 }}>
        Order {order.numberLabel}
        {c.showStatus && order.statusLabel ? ` · ${order.statusLabel}` : ''}
      </Text>
      {order.totalLabel ? (
        <Text style={{ ...typography.muted, color: brand.foreground, margin: '2px 0 0' }}>
          {order.totalLabel}
          {order.dateLabel ? ` · ${order.dateLabel}` : ''}
        </Text>
      ) : null}
      {c.showItems && order.items?.length ? (
        <div style={{ marginTop: spacing.xs }}>
          <CartTable lines={order.items} showPrices={false} />
        </div>
      ) : null}
    </Section>
  );
};

const LoyaltyPoints: SectionComponent = ({ config, data }) => {
  const c = parsed(LoyaltyPointsConfig, config);
  const brand = useBrand();
  const loyalty = dataOf(data, 'loyalty')?.loyalty;
  if (!loyalty) return null;
  const href = firstNonEmpty(c.ctaHref, loyalty.ctaHref);
  return (
    <Section>
      {c.heading ? <SectionHeading>{c.heading}</SectionHeading> : null}
      <EmailHeading level={1}>{loyalty.pointsLabel}</EmailHeading>
      {loyalty.tierName ? (
        <Text style={{ ...typography.muted, color: brand.foreground, margin: 0 }}>
          {loyalty.tierName}
        </Text>
      ) : null}
      {href ? (
        <div style={{ marginTop: spacing.sm }}>
          <EmailButton href={href}>{c.ctaLabel}</EmailButton>
        </div>
      ) : null}
    </Section>
  );
};

export const SECTION_COMPONENTS: Record<string, SectionComponent> = {
  heading: Heading,
  'rich-text': RichText,
  image: ImageBlock,
  button: ButtonBlock,
  divider: Divider,
  spacer: Spacer,
  'featured-products': FeaturedProducts,
  'collection-grid': CollectionGrid,
  'latest-blog-posts': LatestBlogPosts,
  'active-promotion': ActivePromotion,
  'abandoned-cart': AbandonedCart,
  'recommended-products': RecommendedProducts,
  'recent-order': RecentOrder,
  'loyalty-points': LoyaltyPoints,
};
