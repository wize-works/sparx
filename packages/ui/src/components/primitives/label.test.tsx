import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from './label';

describe('Label', () => {
  it('renders the text and forwards htmlFor', () => {
    render(<Label htmlFor="email">Email</Label>);
    const label = screen.getByText('Email');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'email');
  });

  it('shows a danger-tinted asterisk when required', () => {
    render(<Label required>Store name</Label>);
    const asterisk = screen.getByText('*');
    expect(asterisk).toHaveAttribute('aria-hidden');
    expect(asterisk.className).toMatch(/text-\[var\(--color-danger\)\]/);
  });
});
