import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Container } from './container';

describe('Container', () => {
  it('defaults to size="xl"', () => {
    const { container } = render(<Container />);
    expect((container.firstElementChild as HTMLElement).className).toMatch(/max-w-screen-xl/);
  });

  it('applies the selected size max-width', () => {
    const sizes = ['sm', 'md', 'lg', '2xl'] as const;
    for (const s of sizes) {
      const { container, unmount } = render(<Container size={s} />);
      expect((container.firstElementChild as HTMLElement).className).toMatch(
        new RegExp(`max-w-screen-${s}`)
      );
      unmount();
    }
  });

  it('full size opts out of max-width', () => {
    const { container } = render(<Container size="full" />);
    expect((container.firstElementChild as HTMLElement).className).toMatch(/max-w-none/);
  });
});
