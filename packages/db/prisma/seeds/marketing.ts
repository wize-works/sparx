// Seeds the "Sparx Marketing" tenant + the eight module entries that drive
// sparx.works. Each module's `features` reference list resolves to feature
// entries seeded in the same pass.
//
// Idempotent: a re-run upserts. Marketing tenant slug is the lookup key
// for apps/web (env SPARX_MARKETING_TENANT_SLUG).
//
// Module data is INLINED here rather than imported from apps/web — different
// workspace, and the data is small enough that mirroring is cleaner than
// adding a cross-workspace path. If the marketing page copy changes,
// re-running the seed brings the DB into line.

import type { PrismaClient } from '@prisma/client';

const MARKETING_TENANT_SLUG = 'sparx-marketing';

interface ModuleSeed {
  slug: string;
  moduleKey: string;
  label: string;
  headlinePrimary: string;
  headlineSecondary: string;
  title: string;
  description: string;
  lede: string;
  pricing: { price: string; period: string; modifier: 'standalone' | 'additive'; bundleNote: string };
  marketingDomain?: string;
  features: { number: string; title: string; body: string }[];
}

// Mirrors apps/web/lib/modules.ts (lines 41–454) — keep this file as the
// canonical source for the seed, and re-run the seed when the marketing
// copy changes.

const MODULES: ModuleSeed[] = [
  {
    slug: 'storefront',
    moduleKey: 'storefront',
    label: 'Storefront',
    headlinePrimary: 'Themes, pages,',
    headlineSecondary: 'live URLs',
    title: 'Sparx Storefront — Themes, pages, live URLs.',
    description:
      'The Sparx site builder. Pick a theme, edit blocks, point your domain. No code. No staging dance. Live in five minutes.',
    lede: 'The site builder. Pick a theme, edit blocks, point your domain. No code. No staging dance. The same theme system powers a five-product test store and a 50,000-SKU catalog.',
    pricing: { price: '$49', period: '/mo', modifier: 'standalone', bundleNote: 'Storefront is the foundation module — required for shop modules. Free upgrade path to Pro ($299/mo all-in) when you add CRM, Email, and CMS.' },
    features: [
      { number: '01', title: 'Theme-first.', body: 'Pick a polished theme, customize the bits that matter, publish. Power users build fully custom frontends against the same API.' },
      { number: '02', title: 'Block editor.', body: 'Drag, drop, edit. Every block is responsive and accessible by default. No mystery markup, no shadow DOM.' },
      { number: '03', title: 'Custom domain + SSL.', body: 'Point your DNS, we provision a Let’s Encrypt cert automatically. No third-party DNS service, no upcharge.' },
      { number: '04', title: 'CDN-cached.', body: 'Edge-cached pages, instant TTFB worldwide. Stale-while-revalidate on every page so editors see updates immediately.' },
      { number: '05', title: 'Headless if you want.', body: 'Same data, different head. Storefront SDK for Next.js, Remix, Astro — TypeScript types generated from your schema.' },
      { number: '06', title: 'Multi-store, one login.', body: 'Run several brands from one Sparx account. Each store has its own domain, theme, and module mix.' },
    ],
  },
  {
    slug: 'commerce',
    moduleKey: 'commerce',
    label: 'Commerce',
    headlinePrimary: 'Cart, checkout,',
    headlineSecondary: 'orders',
    title: 'Sparx Commerce — Cart, checkout, orders.',
    description: 'Products, inventory, payments. Stripe, PayPal, Klarna. Tax and shipping handled. The transactional core of Sparx.',
    lede: 'Products, inventory, payments. Stripe, PayPal, Klarna out of the box. Tax (Avalara, TaxJar) and shipping (Shippo, EasyPost) wired in. D2C and B2B from the same codebase.',
    pricing: { price: '$49', period: '/mo', modifier: 'additive', bundleNote: 'Commerce activates on top of Storefront. Bundled in Starter ($79/mo), Growth ($149/mo), Pro ($299/mo), and Business ($449/mo).' },
    features: [
      { number: '01', title: 'Inventory that actually tracks.', body: 'Variants, bundles, kits, reservations, low-stock alerts. Real-time across every channel — storefront, MCP, manual orders.' },
      { number: '02', title: 'Checkout that converts.', body: 'Single-page, address autocomplete, saved payment methods, Apple Pay & Shop Pay parity. Conversion-optimized out of the box.' },
      { number: '03', title: 'Payments, plural.', body: 'Stripe, PayPal, Klarna, Affirm. No per-transaction Sparx fee on Pro+. You keep your processor relationships.' },
      { number: '04', title: 'Tax & shipping.', body: 'Avalara and TaxJar for tax; Shippo and EasyPost for shipping rates and labels. Plug your account, done.' },
      { number: '05', title: 'Discounts & gift cards.', body: 'Per-product, per-customer, per-cart rules. Stackable or exclusive. Gift cards with reloadable balances.' },
      { number: '06', title: 'Order ops at scale.', body: 'Bulk fulfillment, batched picking, returns/refunds without a portal walkthrough. Built for actual shipping volume.' },
    ],
  },
  {
    slug: 'cms',
    moduleKey: 'cms',
    label: 'CMS',
    headlinePrimary: 'Words, media,',
    headlineSecondary: 'SEO',
    title: 'Sparx CMS — Words, media, SEO.',
    description: 'Editor, blog, media library, structured content. Works standalone — no storefront required.',
    lede: 'Editor, blog, media library, structured content. Works standalone — no storefront required. The same publishing toolset whether you sell something or just write.',
    pricing: { price: '$49', period: '/mo', modifier: 'standalone', bundleNote: 'CMS can run alone ($49/mo, no Storefront required) or bundled into Content ($79/mo with Storefront) or all-in Pro ($299/mo).' },
    marketingDomain: 'sparxcms.com',
    features: [
      { number: '01', title: 'Block editor, fast.', body: 'No nested-popover hell. Type, format, embed, publish. Autosave on every keystroke; revisions on every save.' },
      { number: '02', title: 'Structured content.', body: 'Define content types (Recipe, Author, Case Study), generate forms automatically. Schema-aware, type-safe API.' },
      { number: '03', title: 'Media library.', body: 'Drag-drop with auto-WebP/AVIF transcode, focal-point cropping, alt-text suggestions. CDN-served.' },
      { number: '04', title: 'SEO that works.', body: 'Per-page meta + OG, sitemaps generated, JSON-LD inferred from your content types. Lighthouse-scored on publish.' },
      { number: '05', title: 'Standalone or paired.', body: 'Use CMS alone for a content site. Pair with Storefront + Commerce and your blog and shop share one design system.' },
      { number: '06', title: 'API + GraphQL.', body: 'Headless out of the box. Fetch content for a separate Next.js, Astro, or mobile app. Webhook on publish.' },
    ],
  },
  {
    slug: 'crm',
    moduleKey: 'crm',
    label: 'CRM',
    headlinePrimary: 'Customers,',
    headlineSecondary: 'pipeline, signal',
    title: 'Sparx CRM — Customers, pipeline, signal.',
    description: 'Activity log, automations, segments. Built on your commerce data — not stitched to it.',
    lede: 'Activity log, automations, segments — sitting on top of the same database as your orders. No sync, no Zapier, no "the HubSpot record disagrees with the Shopify record."',
    pricing: { price: '$49', period: '/mo', modifier: 'additive', bundleNote: 'CRM activates on top of Storefront + Commerce. Bundled in Growth ($149/mo, with Email) and everything above.' },
    marketingDomain: 'sparxcrm.com',
    features: [
      { number: '01', title: 'One customer record.', body: 'Orders, support tickets, RFQs, marketing email opens, AI conversations — all attached to the same person. No deduping.' },
      { number: '02', title: 'Dynamic segments.', body: "Build audiences from any signal: spent over X, hasn't reordered in N days, opened the last email but didn't buy. Sync to Email automatically." },
      { number: '03', title: 'Pipeline that knows commerce.', body: 'Deal stages tied to order status. Quote sent → quote accepted → invoice paid, visible on one card.' },
      { number: '04', title: 'Automations.', body: 'When X happens, do Y. Trigger emails, tag customers, create tasks, fire webhooks. Visual builder, no code.' },
      { number: '05', title: 'Activity timeline.', body: 'Every interaction in chronological order. Phone notes, support replies, order events. Your full picture of a customer.' },
      { number: '06', title: 'Built for sales teams.', body: 'Assigned reps, deal owners, commission-trackable activities. Multi-seat with per-seat permissions.' },
    ],
  },
  {
    slug: 'email',
    moduleKey: 'email',
    label: 'Email',
    headlinePrimary: 'Transactional',
    headlineSecondary: 'and marketing',
    title: 'Sparx Email — Transactional and marketing.',
    description: 'Self-hosted Postal on sparx.email. Your domain, your reputation. No SendGrid markup.',
    lede: 'Self-hosted Postal on sparx.email. Your sending domain, your reputation, SPF/DKIM/DMARC auto-configured. No per-email markup, no $0.0008 nickel-and-dime.',
    pricing: { price: '$29', period: '/mo', modifier: 'additive', bundleNote: 'Email activates on top of Storefront. Bundled in Growth ($149/mo, with CRM) and everything above.' },
    marketingDomain: 'sparxemail.com',
    features: [
      { number: '01', title: 'Transactional out of the box.', body: 'Order confirmations, password resets, RFQ replies — wired into every module. Templates editable, brandable.' },
      { number: '02', title: 'Marketing campaigns.', body: 'Drag-drop or HTML. A/B test subject lines and content. Sync segments live from CRM — no list export ever again.' },
      { number: '03', title: 'Your domain, your reputation.', body: 'Sending from mail.yourstore.com, not noreply@sparx-email-broadcast.com. Deliverability is yours.' },
      { number: '04', title: 'DKIM, SPF, DMARC.', body: 'Auto-provisioned with your custom domain. We add the DNS records, monitor failures, alert on reputation drops.' },
      { number: '05', title: 'No per-email pricing.', body: 'Send 10K or 1M emails a month — same $29/mo. We host the SMTP infrastructure on Postal. No SendGrid bill.' },
      { number: '06', title: 'Open, click, bounce events.', body: 'Tracked into CRM, available via webhook and MCP. Your AI can see who opened what.' },
    ],
  },
  {
    slug: 'b2b',
    moduleKey: 'b2b',
    label: 'B2B · Wholesale · Fleet',
    headlinePrimary: 'Industrial-grade,',
    headlineSecondary: 'out of the box',
    title: 'Sparx B2B — Wholesale, fleet, net terms.',
    description: 'Account-tier pricing, RFQ, purchase orders, fleet accounts, service scheduling. Built for industrial.',
    lede: "Shopify charges $2,400/mo for B2B and still doesn't do net terms properly. Sparx ships wholesale pricing, RFQ, purchase orders, fleet accounts, and service scheduling natively. $99/mo. Built for how industrial actually works.",
    pricing: { price: '$99', period: '/mo', modifier: 'additive', bundleNote: 'B2B activates on top of Storefront + Commerce. The full Business bundle ($449/mo) includes B2B + every other module + 0% transaction fees.' },
    marketingDomain: 'sparxb2b.com',
    features: [
      { number: '01', title: 'Account-tier pricing.', body: 'Per-account price lists, volume breaks, contract pricing. Login determines price; no manual quote needed.' },
      { number: '02', title: 'Net terms & POs.', body: 'Net 15, 30, 60, 90. PO number required at checkout. Aging reports, statements, dunning — built in.' },
      { number: '03', title: 'Fleet accounts.', body: 'Vehicles, drivers, VIN-aware ordering. Service history per unit. PO routing per cost center.' },
      { number: '04', title: 'RFQ & quotes.', body: 'Buyers request quotes from a product page. You reply with line-item pricing and expiration. Approved quotes convert to orders.' },
      { number: '05', title: 'Service scheduling.', body: 'Bookable bays, technicians, parts. Customer-portal scheduling. Reminders via Sparx Email.' },
      { number: '06', title: 'Approval workflows.', body: 'Spend caps per buyer. Manager approval for orders over a threshold. Multi-step approvals for enterprise customers.' },
    ],
  },
  {
    slug: 'ai',
    moduleKey: 'ai',
    label: 'AI · MCP',
    headlinePrimary: 'Ask your AI',
    headlineSecondary: 'anything',
    title: 'Sparx AI — Native MCP server for Claude, ChatGPT, Copilot.',
    description: 'Sparx is the first commerce platform built around the Model Context Protocol. Read live business data with plain English. No exports. No CSVs.',
    lede: 'Sparx is the first commerce platform built around the Model Context Protocol. Connect Claude, ChatGPT, or Copilot once and read live business data with plain English. No exports. No CSVs. No Zapier.',
    pricing: { price: '$49', period: '/mo', modifier: 'additive', bundleNote: 'AI/MCP activates on top of Storefront. Bundled in Pro ($299/mo) and Business ($449/mo).' },
    features: [
      { number: '01', title: 'First-class server.', body: 'Not a plugin. The MCP server is part of the platform, scoped to your tenant, deployed alongside the API.' },
      { number: '02', title: 'Read & write.', body: 'Query orders, customers, products. Create drafts. Update inventory. Send a quote. Everything the API can do, your AI can do.' },
      { number: '03', title: 'Scoped, audited.', body: 'Per-agent API keys. Per-tool permissions. Every call written to the audit log. Revoke in one click.' },
      { number: '04', title: 'Works with everyone.', body: 'Claude, ChatGPT, Copilot, Cursor, any MCP-compatible client. One endpoint, all of them.' },
      { number: '05', title: 'No prompt engineering.', body: 'Tools are typed and self-describing. The model figures out the schema. You just ask.' },
      { number: '06', title: 'Streaming responses.', body: 'Tool results stream back, the model reasons over them in real time. No "thinking" stalls for multi-step queries.' },
    ],
  },
  {
    slug: 'dropship',
    moduleKey: 'dropship',
    label: 'Dropship',
    headlinePrimary: 'Suppliers, sync,',
    headlineSecondary: 'fulfillment',
    title: 'Sparx Dropship — Suppliers, sync, fulfillment.',
    description: 'Catalog sync, margin math, automated order routing. Sell without inventory.',
    lede: 'Catalog sync, margin math, automated order routing. Sell without holding inventory — but with a real platform underneath, not a Shopify app stacked on a Shopify app.',
    pricing: { price: '$29', period: '/mo', modifier: 'additive', bundleNote: 'Dropship activates on top of Storefront + Commerce. Bundled in Pro ($299/mo) and Business ($449/mo).' },
    features: [
      { number: '01', title: 'Supplier connectors.', body: 'Native integrations for major suppliers + a generic CSV/FTP/API import for the long tail. Hourly sync, conflict resolution included.' },
      { number: '02', title: 'Margin math.', body: 'Set per-supplier markup rules (flat, percentage, tiered). Sparx maintains your retail price as supplier costs change.' },
      { number: '03', title: 'Automated routing.', body: 'Order comes in → routed to the right supplier instantly. Multi-supplier orders split correctly with one customer-facing tracking.' },
      { number: '04', title: 'Inventory sync.', body: 'Real-time stock levels from supplier. Out-of-stock products auto-hidden, back-in-stock auto-relisted.' },
      { number: '05', title: 'Tracking & fulfillment.', body: 'Supplier sends tracking, Sparx forwards to customer via Sparx Email with your branding.' },
      { number: '06', title: 'No middleman markup.', body: 'You connect directly to your suppliers. Sparx takes $29/mo flat — no per-order Sparx fee, no Oberlo-style cut.' },
    ],
  },
];

async function ensureTenant(prisma: PrismaClient): Promise<string> {
  const existing = await prisma.tenant.findUnique({ where: { slug: MARKETING_TENANT_SLUG } });
  if (existing) return existing.id;
  const created = await prisma.tenant.create({
    data: {
      slug: MARKETING_TENANT_SLUG,
      name: 'Sparx Marketing',
      email: 'marketing@sparx.works',
      plan: 'platform',
      status: 'active',
      settings: {
        primaryDomain: 'sparx.works',
        modules: { storefront: { enabled: true }, cms: { enabled: true } },
      },
    },
  });
  return created.id;
}

export async function seedMarketingContent(prisma: PrismaClient): Promise<void> {
  const tenantId = await ensureTenant(prisma);

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);

    for (const meta of MODULES) {
      // Features first so the module's reference list can resolve.
      const featureIds: string[] = [];
      for (const feature of meta.features) {
        const slug = `${meta.slug}-${feature.number}`;
        const body = {
          number: feature.number,
          title: feature.title,
          body: feature.body,
        };
        const existing = await tx.contentEntry.findFirst({
          where: { typeKey: 'feature', slug },
          select: { id: true },
        });
        if (existing) {
          await tx.contentEntry.update({
            where: { id: existing.id },
            data: { body, status: 'published', publishedAt: new Date() },
          });
          featureIds.push(existing.id);
        } else {
          const row = await tx.contentEntry.create({
            data: {
              tenantId,
              typeKey: 'feature',
              slug,
              status: 'published',
              publishedAt: new Date(),
              body,
              seoJson: {},
            },
          });
          featureIds.push(row.id);
        }
      }

      const moduleBody = {
        label: meta.label,
        moduleKey: meta.moduleKey,
        headlinePrimary: meta.headlinePrimary,
        headlineSecondary: meta.headlineSecondary,
        title: meta.title,
        description: meta.description,
        lede: meta.lede,
        features: featureIds,
        pricing: meta.pricing,
        ...(meta.marketingDomain ? { marketingDomain: `https://${meta.marketingDomain}` } : {}),
      };

      const existing = await tx.contentEntry.findFirst({
        where: { typeKey: 'module', slug: meta.slug },
        select: { id: true },
      });
      if (existing) {
        await tx.contentEntry.update({
          where: { id: existing.id },
          data: { body: moduleBody, status: 'published', publishedAt: new Date() },
        });
      } else {
        await tx.contentEntry.create({
          data: {
            tenantId,
            typeKey: 'module',
            slug: meta.slug,
            status: 'published',
            publishedAt: new Date(),
            body: moduleBody,
            seoJson: { title: meta.title, description: meta.description },
          },
        });
      }
    }

    console.log(`Marketing seed: tenant=${tenantId} modules=${MODULES.length}`);
  });
}
