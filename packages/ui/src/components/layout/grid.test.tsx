import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Grid } from './grid';

describe('Grid', () => {
  it('defaults to grid grid-cols-1 gap-4', () => {
    const { container } = render(<Grid />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toMatch(/\bgrid\b/);
    expect(cls).toMatch(/grid-cols-1/);
    expect(cls).toMatch(/gap-4/);
  });

  it('applies cols and responsive md/lg cols', () => {
    const { container } = render(<Grid cols={2} mdCols={3} lgCols={4} gap={6} />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toMatch(/grid-cols-2/);
    expect(cls).toMatch(/md:grid-cols-3/);
    expect(cls).toMatch(/lg:grid-cols-4/);
    expect(cls).toMatch(/gap-6/);
  });
});
