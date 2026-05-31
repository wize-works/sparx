import { describe, expect, it } from 'vitest';
import type { EmailSectionInstance, SectionDataMap } from '@sparx/email-sections';
import { renderSections } from '../render';

const brand = { primary: '#0EA5E9', storeName: 'Acme Diesel' };

describe('renderSections', () => {
  it('renders static heading + rich-text inside the branded frame', async () => {
    const sections: EmailSectionInstance[] = [
      { id: 'h1', type: 'heading', config: { text: 'Hey Sarah', level: 'h1' } },
      { id: 'rt', type: 'rich-text', config: {} },
    ];
    const data: SectionDataMap = {
      rt: { kind: 'rich-text', html: '<p>Welcome to the shop.</p>' },
    };
    const out = await renderSections(
      { sections, subject: 'Hello', preheader: 'A note', to: 'x@y.com', data },
      { brand }
    );
    expect(out.html).toContain('Hey Sarah');
    expect(out.html).toContain('Welcome to the shop.');
    expect(out.html).toContain('Acme Diesel'); // footer wordmark fallback
    // Plain text is auto-generated; html-to-text upper-cases <h1>, so assert the
    // body prose (un-cased) rather than the heading.
    expect(out.text).toContain('Welcome to the shop.');
    expect(out.subject).toBe('Hello');
  });

  it('renders a featured-products grid from resolved data', async () => {
    const sections: EmailSectionInstance[] = [
      { id: 'fp', type: 'featured-products', config: { heading: 'Picks', columns: 2, limit: 4 } },
    ];
    const data: SectionDataMap = {
      fp: {
        kind: 'products',
        products: [
          { title: 'Turbo Kit', priceLabel: '$1,249', url: 'https://s/1' },
          { title: 'Injectors', priceLabel: '$389', url: 'https://s/2' },
        ],
      },
    };
    const out = await renderSections(
      { sections, subject: 'Picks', to: 'x@y.com', data },
      { brand }
    );
    expect(out.html).toContain('Picks');
    expect(out.html).toContain('Turbo Kit');
    expect(out.html).toContain('$1,249');
    expect(out.html).toContain('Injectors');
  });

  it('omits a personalized section whose resolved data is empty', async () => {
    const sections: EmailSectionInstance[] = [
      { id: 'cart', type: 'abandoned-cart', config: { heading: 'Still in your cart' } },
    ];
    // No data entry for `cart` → the section renders nothing.
    const out = await renderSections({ sections, subject: 'Cart', to: 'x@y.com' }, { brand });
    expect(out.html).not.toContain('Still in your cart');
  });

  it('renders an abandoned-cart with lines + recover CTA', async () => {
    const sections: EmailSectionInstance[] = [
      {
        id: 'cart',
        type: 'abandoned-cart',
        config: { heading: 'Still in your cart', ctaLabel: 'Finish' },
      },
    ];
    const data: SectionDataMap = {
      cart: {
        kind: 'cart',
        recoverUrl: 'https://s/recover',
        lines: [{ title: 'Boost Tubes', quantity: 1, priceLabel: '$210' }],
      },
    };
    const out = await renderSections({ sections, subject: 'Cart', to: 'x@y.com', data }, { brand });
    expect(out.html).toContain('Boost Tubes');
    expect(out.html).toContain('Finish');
    expect(out.html).toContain('https://s/recover');
  });

  it('skips unknown section types without throwing', async () => {
    const sections: EmailSectionInstance[] = [
      { id: 'x', type: 'not-a-real-type', config: {} },
      { id: 'h', type: 'heading', config: { text: 'Visible' } },
    ];
    const out = await renderSections({ sections, subject: 'S', to: 'x@y.com' }, { brand });
    expect(out.html).toContain('Visible');
  });
});
