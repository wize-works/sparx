import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColorPicker } from './color-picker';

describe('ColorPicker', () => {
  it('renders a swatch button and a hex text input', () => {
    render(<ColorPicker value="#6366F1" />);
    expect(screen.getByRole('button', { name: /swatch/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('#6366F1');
  });

  it('normalizes short hex on blur and fires onChange', async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#000000" onChange={onChange} />);
    const input = screen.getByRole('textbox');

    await userEvent.clear(input);
    await userEvent.type(input, '#abc');
    await userEvent.tab(); // blur

    expect(onChange).toHaveBeenLastCalledWith('#AABBCC');
  });

  it('reverts to the prior value when blurred with invalid text', async () => {
    render(<ColorPicker value="#FF0000" />);
    const input = screen.getByRole('textbox');

    await userEvent.clear(input);
    await userEvent.type(input, 'not-a-color');
    await userEvent.tab();

    expect(input).toHaveValue('#FF0000');
  });

  it('selects a swatch when one is clicked', async () => {
    const onChange = vi.fn();
    render(<ColorPicker onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: /swatch/i }));
    // CMS teal is in DEFAULT_SWATCHES
    const teal = await screen.findByRole('button', { name: '#14B8A6' });
    await userEvent.click(teal);

    expect(onChange).toHaveBeenCalledWith('#14B8A6');
  });
});
