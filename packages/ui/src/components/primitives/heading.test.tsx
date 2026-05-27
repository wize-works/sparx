import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Heading } from './heading';

describe('Heading', () => {
  it('defaults to <h2>', () => {
    render(<Heading>Section</Heading>);
    expect(screen.getByRole('heading', { level: 2, name: 'Section' })).toBeInTheDocument();
  });

  it('maps level prop to the corresponding tag', () => {
    const levels = [1, 2, 3, 4, 5, 6] as const;
    for (const lvl of levels) {
      const { unmount } = render(<Heading level={lvl}>L{lvl}</Heading>);
      expect(screen.getByRole('heading', { level: lvl })).toBeInTheDocument();
      unmount();
    }
  });

  it('honors `as` override (semantic vs visual divergence)', () => {
    // visually H1-sized, but semantically an H2 — common a11y pattern
    render(
      <Heading level={1} as="h2">
        Hero
      </Heading>
    );
    const h2 = screen.getByRole('heading', { level: 2, name: 'Hero' });
    expect(h2.tagName).toBe('H2');
    // visual styling still picks up the level-1 size
    expect(h2.className).toMatch(/text-3xl/);
  });
});
