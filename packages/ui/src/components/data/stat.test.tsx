import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Stat } from './stat';

describe('Stat', () => {
  it('renders label and value', () => {
    render(<Stat label="Revenue" value="$12,408" />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('$12,408')).toBeInTheDocument();
  });

  it('applies success token for upward delta', () => {
    render(<Stat label="Orders" value="42" delta={{ value: '+12%', trend: 'up' }} />);
    const delta = screen.getByText('+12%');
    expect(delta.className).toMatch(/text-\[var\(--color-success-text\)\]/);
  });

  it('applies danger token for downward delta', () => {
    render(<Stat label="Refunds" value="3" delta={{ value: '-1', trend: 'down' }} />);
    const delta = screen.getByText('-1');
    expect(delta.className).toMatch(/text-\[var\(--color-danger-text\)\]/);
  });
});
