import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Divider } from './divider';

describe('Divider', () => {
  it('is decorative by default (role="none")', () => {
    const { container } = render(<Divider />);
    expect((container.firstElementChild as HTMLElement)).toHaveAttribute('role', 'none');
  });

  it('exposes role="separator" when decorative={false}', () => {
    render(<Divider decorative={false} />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('orientation="vertical" applies the vertical sizing classes', () => {
    const { container } = render(<Divider orientation="vertical" />);
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toMatch(/w-px/);
    expect(cls).toMatch(/self-stretch/);
  });

  it('reports aria-orientation on the semantic role', () => {
    render(<Divider decorative={false} orientation="vertical" />);
    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical');
  });
});
