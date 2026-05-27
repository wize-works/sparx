import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';

function Fixture({ variant }: { variant?: 'default' | 'error' }) {
  return (
    <Select>
      <SelectTrigger variant={variant} aria-label="theme">
        <SelectValue placeholder="Pick a theme" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="industrial">Industrial</SelectItem>
        <SelectItem value="minimal">Minimal</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe('Select', () => {
  it('renders the trigger with the placeholder when closed', () => {
    render(<Fixture />);
    expect(screen.getByRole('combobox', { name: 'theme' })).toBeInTheDocument();
    expect(screen.getByText('Pick a theme')).toBeInTheDocument();
  });

  it('does not render options until the trigger is opened', () => {
    render(<Fixture />);
    expect(screen.queryByText('Industrial')).not.toBeInTheDocument();
    expect(screen.queryByText('Minimal')).not.toBeInTheDocument();
  });

  it('applies the danger border on variant="error"', () => {
    render(<Fixture variant="error" />);
    const trigger = screen.getByRole('combobox');
    expect(trigger.className).toMatch(/border-\[var\(--color-danger\)\]/);
  });
});
