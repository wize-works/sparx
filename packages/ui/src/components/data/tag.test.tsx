import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tag } from './tag';

describe('Tag', () => {
  it('renders the label', () => {
    render(<Tag>Published</Tag>);
    expect(screen.getByText('Published')).toBeInTheDocument();
  });

  it('shows a remove button when onRemove is provided and fires it on click', async () => {
    const onRemove = vi.fn();
    render(<Tag onRemove={onRemove}>filter</Tag>);
    const btn = screen.getByRole('button', { name: 'Remove' });
    await userEvent.click(btn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('omits the remove button when onRemove is not provided', () => {
    render(<Tag>filter</Tag>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('carries the module color class for color="module"', () => {
    render(<Tag color="module">cms</Tag>);
    // The span itself carries the color class
    const tag = screen.getByText('cms').parentElement!;
    expect(tag.className).toMatch(/sx-c-module/);
  });
});
