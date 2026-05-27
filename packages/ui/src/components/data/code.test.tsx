import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Code } from './code';

describe('Code', () => {
  it('renders as an inline <code> by default', () => {
    render(<Code>pnpm install</Code>);
    const el = screen.getByText('pnpm install');
    expect(el.tagName).toBe('CODE');
    expect(el.className).toMatch(/font-mono/);
  });

  it('wraps block variant in <pre><code>', () => {
    const { container } = render(<Code variant="block">{`{\n  "ok": true\n}`}</Code>);
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.firstElementChild?.tagName).toBe('CODE');
  });
});
