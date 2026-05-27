import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Stack } from './stack';

describe('Stack', () => {
  it('defaults to flex-col with gap-4', () => {
    const { container } = render(<Stack data-testid="s" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toMatch(/flex-col/);
    expect(el.className).toMatch(/gap-4/);
  });

  it('switches to flex-row when direction="row"', () => {
    const { container } = render(<Stack direction="row" />);
    expect((container.firstElementChild as HTMLElement).className).toMatch(/flex-row/);
  });

  it('maps gap/align/justify props to Tailwind classes', () => {
    const { container } = render(<Stack gap={6} align="center" justify="between" />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toMatch(/gap-6/);
    expect(cls).toMatch(/items-center/);
    expect(cls).toMatch(/justify-between/);
  });
});
