import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies the default variant by default', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default');
    expect(badge.className).toMatch(/bg-\[var\(--color-bg-subtle\)\]/);
  });

  it('uses --module-active-tint background for the module variant', () => {
    render(<Badge variant="module">Module</Badge>);
    const badge = screen.getByText('Module');
    expect(badge.className).toMatch(/bg-\[var\(--module-active-tint\)\]/);
    expect(badge.className).toMatch(/text-\[var\(--module-active-text\)\]/);
  });

  it('uses success tokens for the success variant', () => {
    render(<Badge variant="success">Published</Badge>);
    const badge = screen.getByText('Published');
    expect(badge.className).toMatch(/bg-\[var\(--color-success-tint\)\]/);
  });
});
