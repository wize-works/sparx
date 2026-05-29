// Locks the JSON → HTML contract for every block + mark we ship. Any new
// node added to extensions.ts needs a case here, or the editor and the
// public render will silently drift.

import { describe, expect, it } from 'vitest';
import { renderDocToHtml } from './serialize';

function doc(content: unknown[]): unknown {
  return { type: 'doc', content };
}

describe('renderDocToHtml', () => {
  it('renders paragraphs + headings + lists', () => {
    const html = renderDocToHtml(
      doc([
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hello' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'World' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }],
            },
          ],
        },
      ])
    );
    expect(html).toBe('<h2>Hello</h2><p>World</p><ul><li><p>One</p></li></ul>');
  });

  it('escapes XSS in text + drops javascript: links', () => {
    const html = renderDocToHtml(
      doc([
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '<script>',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ])
    );
    expect(html).toBe('<p>&lt;script&gt;</p>');
  });

  it('renders callout with sanitised variant', () => {
    const html = renderDocToHtml(
      doc([
        {
          type: 'callout',
          attrs: { variant: 'warning' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'heads up' }] }],
        },
        {
          type: 'callout',
          attrs: { variant: '<script>' as unknown as string },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bad' }] }],
        },
      ])
    );
    expect(html).toContain('sparx-callout--warning');
    expect(html).toContain('sparx-callout--info'); // bad variant falls back
    expect(html).not.toContain('<script>');
  });

  it('emits youtube/vimeo embed as sandboxed iframe and drops unknown providers', () => {
    const html = renderDocToHtml(
      doc([
        {
          type: 'embed',
          attrs: { provider: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' },
        },
        {
          type: 'embed',
          attrs: { provider: 'vimeo', url: 'https://vimeo.com/123456789' },
        },
        {
          type: 'embed',
          attrs: { provider: 'unknown', url: 'https://malicious.example/' },
        },
      ])
    );
    expect(html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(html).toContain('player.vimeo.com/video/123456789');
    expect(html).not.toContain('malicious.example');
  });

  it('renders code block only when language is on the allowlist', () => {
    const html = renderDocToHtml(
      doc([
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const x = 1;' }],
        },
        {
          type: 'codeBlock',
          attrs: { language: '<script>' },
          content: [{ type: 'text', text: 'noop' }],
        },
      ])
    );
    expect(html).toContain('language-typescript');
    expect(html).not.toContain('language-&lt;script&gt;');
  });

  it('renders sparxImage with focal point and caption', () => {
    const html = renderDocToHtml(
      doc([
        {
          type: 'sparxImage',
          attrs: {
            src: 'https://api.sparx.works/v1/public/media/variants/t/a/x.webp',
            alt: 'photo',
            caption: 'cap',
            focalPointX: 0.25,
            focalPointY: 0.75,
            assetId: '00000000-0000-0000-0000-000000000001',
          },
        },
      ])
    );
    expect(html).toContain('object-position:25.0% 75.0%');
    expect(html).toContain('alt="photo"');
    expect(html).toContain('<figcaption>cap</figcaption>');
    expect(html).toContain('data-asset-id=');
  });

  it('renders table structure with colspan/rowspan when present', () => {
    const html = renderDocToHtml(
      doc([
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: { colspan: 2 },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
                },
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
                },
              ],
            },
          ],
        },
      ])
    );
    expect(html).toContain('<table class="sparx-table">');
    expect(html).toContain('colspan="2"');
    expect(html).toContain('<td>');
  });

  it('renders inline reference with default URL resolver and a custom one', () => {
    const node = {
      type: 'sparxReference',
      attrs: { entryId: 'eid', typeKey: 'blog_post', label: 'Hello' },
    };
    const html = renderDocToHtml(doc([{ type: 'paragraph', content: [node] }]));
    expect(html).toContain('href="/blog_post/eid"');
    expect(html).toContain('@Hello');

    const custom = renderDocToHtml(doc([{ type: 'paragraph', content: [node] }]), {
      resolveReference: (id, t) => `https://x.example/${t}/${id}`,
    });
    expect(custom).toContain('href="https://x.example/blog_post/eid"');
  });

  it('drops unknown nodes silently', () => {
    const html = renderDocToHtml(
      doc([
        { type: 'evil', content: [{ type: 'text', text: 'pwned' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'fine' }] },
      ])
    );
    expect(html).toBe('<p>fine</p>');
  });
});
