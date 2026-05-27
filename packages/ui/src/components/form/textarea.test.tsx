import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('renders with the configured rows', () => {
    render(<Textarea aria-label="about" rows={5} />);
    expect(screen.getByRole('textbox', { name: 'about' })).toHaveAttribute('rows', '5');
  });

  it('defaults to 3 rows', () => {
    render(<Textarea aria-label="about" />);
    expect(screen.getByRole('textbox')).toHaveAttribute('rows', '3');
  });

  it('accepts typed input', async () => {
    render(<Textarea aria-label="about" />);
    await userEvent.type(screen.getByRole('textbox'), 'hello\nworld');
    expect(screen.getByRole('textbox')).toHaveValue('hello\nworld');
  });
});
