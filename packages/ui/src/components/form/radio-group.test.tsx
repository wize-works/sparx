import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadioGroup, RadioGroupItem } from './radio-group';

function Controlled() {
  const [value, setValue] = useState('a');
  return (
    <RadioGroup value={value} onValueChange={setValue} aria-label="flavor">
      <RadioGroupItem value="a" aria-label="A" />
      <RadioGroupItem value="b" aria-label="B" />
      <RadioGroupItem value="c" aria-label="C" />
    </RadioGroup>
  );
}

describe('RadioGroup', () => {
  it('exposes radios with the correct aria-checked state', () => {
    render(<Controlled />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveAttribute('aria-checked', 'true');
    expect(radios[1]).toHaveAttribute('aria-checked', 'false');
  });

  it('switches selection when another item is clicked', async () => {
    render(<Controlled />);
    await userEvent.click(screen.getByRole('radio', { name: 'B' }));
    expect(screen.getByRole('radio', { name: 'A' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'B' })).toHaveAttribute('aria-checked', 'true');
  });

  it('fires onValueChange with the new value', async () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup onValueChange={onValueChange} aria-label="g">
        <RadioGroupItem value="x" aria-label="X" />
        <RadioGroupItem value="y" aria-label="Y" />
      </RadioGroup>
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Y' }));
    expect(onValueChange).toHaveBeenCalledWith('y');
  });
});
