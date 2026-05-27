import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './checkbox';

function Controlled({ initial = false }: { initial?: boolean }) {
  const [v, setV] = useState<boolean | 'indeterminate'>(initial);
  return <Checkbox checked={v} onCheckedChange={setV} aria-label="agree" />;
}

describe('Checkbox', () => {
  it('toggles checked state on click', async () => {
    render(<Controlled />);
    const cb = screen.getByRole('checkbox', { name: 'agree' });
    expect(cb).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(cb);
    expect(cb).toHaveAttribute('aria-checked', 'true');
  });

  it('fires onCheckedChange with the new state', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox onCheckedChange={onCheckedChange} aria-label="agree" />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('reports aria-checked="mixed" when indeterminate', () => {
    render(<Checkbox checked="indeterminate" aria-label="select-all" />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'mixed');
  });
});
