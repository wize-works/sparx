import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies the neutral color by default', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default');
    expect(badge.className).toMatch(/sx-c-neutral/);
  });

  it('carries the module color class for color="module"', () => {
    render(<Badge color="module">Module</Badge>);
    const badge = screen.getByText('Module');
    expect(badge.className).toMatch(/sx-c-module/);
  });

  it('carries the success color class for color="success"', () => {
    render(<Badge color="success">Published</Badge>);
    const badge = screen.getByText('Published');
    expect(badge.className).toMatch(/sx-c-success/);
  });
});
