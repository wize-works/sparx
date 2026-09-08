// renderInvoiceTree — the builder-authored print template renderer (docs/87 §10,
// Phase 5b). A PEER renderer in the builder framework, alongside the page renderer
// (wizeworks/apps/site builder-renderer) and the email renderer (@wizeworks/email): it walks the
// SAME BuilderNode tree and resolves bindings through the SAME runtime (resolvePath
// / cardinalityOf), and serializes Prose through the SAME audited serializer
// (@wizeworks/cms-editor/serialize) the page/email renderers use.
//
// Where it differs: it emits FULL-PAGE print HTML (not 560px email tables), and it
// recognises a tier of DATA-AWARE invoice nodes (InvoiceLineTable, InvoiceTotals,
// InvoiceParties, …) that render the financial substance through @wizeworks/crm's
// shared print section builders — the exact blocks the code default renderer uses,
// so a default print and a customised template stay visually one. The author owns
// LAYOUT (header / logo / column order / a Prose terms block / accent); the
// financial core is structured, never free-form (docs/87 §10).
//
// Lives in api-rest (the composition root that already carries @wizeworks/builder-schemas
// + @wizeworks/cms-editor) so @wizeworks/crm stays free of those deps.

import {
  cardinalityOf,
  resolvePath,
  type BuilderNode,
  type DataSources,
  type Scope,
} from '@wizeworks/builder-schemas';
import { renderDocToHtml } from '@wizeworks/cms-editor/serialize';
import {
  docHeadBlockHtml,
  escapeHtml,
  formatDate,
  formatMoney,
  invoiceHtmlShell,
  lineTableHtml,
  notesBlockHtml,
  partiesBlockHtml,
  paymentsBlockHtml,
  resolveBillingBrand,
  sellerBlockHtml,
  totalsBlockHtml,
  type BillingRenderBrand,
  type BillingRenderData,
} from '@wizeworks/crm';

const esc = escapeHtml;

// Layout containers — arrange children; everything else is a leaf (a chrome
// primitive or a data-aware invoice node).
const CONTAINERS = new Set(['Section', 'Stack', 'Row', 'Grid', 'Card', 'Group', 'Container']);

// ── Bound-value coercion (mirrors the page/email renderers) ───────────────────

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function asImageUrl(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return asImageUrl(value[0]);
  if (value && typeof value === 'object' && 'url' in value) {
    const url: unknown = value.url;
    return typeof url === 'string' ? url : '';
  }
  return '';
}

function isProseDoc(value: unknown): boolean {
  return (
    typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'doc'
  );
}

// ── Scope ─────────────────────────────────────────────────────────────────────

/** The data scope chrome leaves bind against — the document reduced to display
 *  strings (`{{ document.number }}`, `{{ totals.balance }}`, …). The data-aware
 *  invoice nodes ignore this and pull from the structured render data directly. */
function buildScope(data: BillingRenderData, brand: BillingRenderBrand): Scope {
  const b = resolveBillingBrand(brand);
  const root: DataSources = {
    document: {
      number: data.number ?? '',
      title: data.title,
      status: data.status,
      currency: data.currency,
      issued: formatDate(data.issuedAt),
      due: formatDate(data.dueAt),
      validUntil: formatDate(data.validUntil),
    },
    seller: { name: b.businessName },
    billTo: data.billTo ? { name: data.billTo.name } : {},
    shipTo: data.shipTo ? { name: data.shipTo.name } : {},
    // Enough rows that a hand-built chrome block can ADD UP. It offered
    // subtotal, total and balance only, so a template author who laid out a
    // totals table by hand had no way to show the tax, the delivery charge or a
    // surcharge -- the gap between subtotal and total simply appeared, with
    // nothing to point at. The data-aware totals node already prints them all;
    // these bindings exist so chrome does not have to be wrong to be simple.
    totals: {
      subtotal: formatMoney(data.totals.subtotal, data.currency),
      tax: formatMoney(data.totals.taxTotal, data.currency),
      delivery: formatMoney(data.totals.shippingTotal, data.currency),
      surcharge: formatMoney(data.totals.surchargeTotal, data.currency),
      total: formatMoney(data.totals.total, data.currency),
      balance: formatMoney(data.totals.balance, data.currency),
    },
  };
  return { root };
}

// ── Leaf rendering ────────────────────────────────────────────────────────────

function renderLeaf(
  node: BuilderNode,
  value: unknown,
  bound: boolean,
  data: BillingRenderData,
  brand: BillingRenderBrand
): string {
  const p = node.props ?? {};
  const str = (k: string): string => (typeof p[k] === 'string' ? p[k] : '');

  switch (node.type) {
    // ── Chrome primitives (authored layout) ──────────────────────────────────
    case 'Heading': {
      const level = str('level') || 'h2';
      const text = (bound ? asText(value) : '') || str('text');
      if (!text) return '';
      const tag = level === 'h1' ? 'h1' : level === 'h3' ? 'h3' : 'h2';
      return `<${tag} class="tpl-heading">${esc(text)}</${tag}>`;
    }
    case 'Text': {
      const text = (bound ? asText(value) : '') || str('text');
      return text ? `<p class="tpl-text">${esc(text)}</p>` : '';
    }
    case 'Prose': {
      // Authored rich text (terms / footer) — serialized through the shared,
      // React-free CMS serializer, exactly like the page/email Prose leaf. A bound
      // doc wins; a bound string falls back to one paragraph; else the static doc.
      const doc = bound && isProseDoc(value) ? value : p.doc;
      const html = renderDocToHtml(doc);
      if (html) return `<div class="invoice-prose">${html}</div>`;
      const plain = bound ? asText(value) : '';
      return plain ? `<div class="invoice-prose"><p>${esc(plain)}</p></div>` : '';
    }
    case 'Image': {
      const src = (bound ? asImageUrl(value) : '') || str('src');
      if (!src) return '';
      return `<img class="tpl-image" src="${esc(src)}" alt="${esc(str('alt'))}" />`;
    }
    case 'Divider':
      return '<hr class="tpl-divider" />';

    // ── Data-aware invoice nodes (the financial substance) ────────────────────
    case 'InvoiceMasthead':
      return `<header class="masthead"><div class="masthead-seller">${sellerBlockHtml(
        brand
      )}</div>${docHeadBlockHtml(data)}</header>`;
    case 'InvoiceLogo':
      return `<div class="masthead-seller">${sellerBlockHtml(brand)}</div>`;
    case 'InvoiceMeta':
      return docHeadBlockHtml(data);
    case 'InvoiceParties':
      return partiesBlockHtml(data);
    case 'InvoiceLineTable':
      return lineTableHtml(data);
    case 'InvoiceTotals':
      return totalsBlockHtml(data);
    case 'InvoiceNotes':
      return notesBlockHtml(data);
    case 'InvoicePayments':
      return paymentsBlockHtml(data);
    case 'InvoiceFooter': {
      const b = resolveBillingBrand(brand);
      return `<div class="footer">${esc(b.businessName)}${
        data.number ? ` &middot; ${esc(data.number)}` : ''
      }</div>`;
    }
    default:
      return '';
  }
}

// ── Container layout ──────────────────────────────────────────────────────────

/** A container's print class. A plain container flows its children (each section
 *  carries its own margins, matching the default renderer); a row (`flex-row` /
 *  `row` token in the class string) lays them side by side. */
function containerClass(cls: string | undefined): string {
  const tokens = (cls ?? '').split(/\s+/).filter(Boolean);
  const isRow = tokens.some((t) => {
    const bare = t.slice(t.lastIndexOf(':') + 1);
    return bare === 'flex-row' || bare === 'row';
  });
  return isRow ? 'ibx-row' : '';
}

// ── Recursive node ──────────────────────────────────────────────────────────

function renderNode(
  node: BuilderNode,
  scope: Scope,
  data: BillingRenderData,
  brand: BillingRenderBrand
): string {
  // Invoice/billing trees bind by field path only (document.* merge fields).
  const bound = Boolean(node.binding?.path);
  const value = bound ? resolvePath(scope, node.binding!.path ?? '') : undefined;

  if (!CONTAINERS.has(node.type)) {
    return renderLeaf(node, value, bound, data, brand);
  }

  const kids = node.children ?? [];
  const card = bound ? cardinalityOf(value) : 'empty';
  let inner: string;
  if (bound && card === 'array') {
    inner = (value as unknown[])
      .map((item, i) =>
        kids.map((c) => renderNode(c, { ...scope, item, index: i }, data, brand)).join('')
      )
      .join('');
  } else if (bound && card === 'object') {
    inner = kids.map((c) => renderNode(c, { ...scope, item: value }, data, brand)).join('');
  } else {
    inner = kids.map((c) => renderNode(c, scope, data, brand)).join('');
  }

  const cls = containerClass(node.class);
  return cls ? `<div class="${cls}">${inner}</div>` : `<div>${inner}</div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Render a billing document (live or frozen render data) through an authored
 *  print template tree, into a complete branded print-HTML document. */
export function renderInvoiceTree(
  tree: BuilderNode,
  data: BillingRenderData,
  brand: BillingRenderBrand = {}
): string {
  const scope = buildScope(data, brand);
  const body = renderNode(tree, scope, data, brand);
  const docTitle = data.number ? `${data.title} ${data.number}` : data.title;
  return invoiceHtmlShell({ title: docTitle, brand, body });
}
