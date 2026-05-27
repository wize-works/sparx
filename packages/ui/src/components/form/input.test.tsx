import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';

describe('Input', () => {
  it('renders as type="text" by default', () => {
    render(<Input aria-label="store" />);
    expect(screen.getByRole('textbox', { name: 'store' })).toHaveAttribute('type', 'text');
  });

  it('accepts typed input', async () => {
    render(<Input aria-label="store" />);
    const input = screen.getByRole('textbox', { name: 'store' });
    await userEvent.type(input, 'Gillett Diesel');
    expect(input).toHaveValue('Gillett Diesel');
  });

  it('applies the danger border on variant="error"', () => {
    render(<Input variant="error" aria-label="email" />);
    expect(screen.getByRole('textbox').className).toMatch(/border-\[var\(--color-danger\)\]/);
  });
});
