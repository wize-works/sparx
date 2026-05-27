import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePicker } from './date-picker';

describe('DatePicker', () => {
  it('shows the placeholder when no value is set', () => {
    render(<DatePicker placeholder="Pick a date" />);
    expect(screen.getByRole('button')).toHaveTextContent('Pick a date');
  });

  it('formats the provided value via the default date-fns format', () => {
    const d = new Date(2026, 4, 27); // May 27, 2026
    render(<DatePicker value={d} />);
    // 'PPP' format → "May 27th, 2026" in date-fns default locale
    expect(screen.getByRole('button')).toHaveTextContent(/May 27/);
  });

  it('opens the calendar popover when the trigger is clicked', async () => {
    render(<DatePicker />);
    await userEvent.click(screen.getByRole('button'));
    // react-day-picker exposes role="grid" for the calendar
    expect(await screen.findByRole('grid')).toBeInTheDocument();
  });

  it('respects the disabled prop', () => {
    render(<DatePicker disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not fire onChange just from opening the picker', async () => {
    const onChange = vi.fn();
    render(<DatePicker onChange={onChange} />);
    await userEvent.click(screen.getByRole('button'));
    await screen.findByRole('grid');
    expect(onChange).not.toHaveBeenCalled();
  });
});
