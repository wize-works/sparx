import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('Button', () => {
  it('renders children inside a <button> by default', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('applies the primary variant by default', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.className).toMatch(/bg-\[var\(--sparx-primary\)\]/);
  });

  it('switches to the module variant on demand', () => {
    render(<Button variant="module">Configure</Button>);
    const btn = screen.getByRole('button', { name: 'Configure' });
    expect(btn.className).toMatch(/bg-\[var\(--module-active\)\]/);
  });

  it('renders a spinner and is aria-busy when loading', () => {
    render(<Button loading>Saving</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('is disabled while loading even without an explicit disabled prop', () => {
    render(<Button loading>Saving</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('with asChild, renders the provided element instead of a <button>', () => {
    render(
      <Button asChild>
        <a href="/cms">Open CMS</a>
      </Button>
    );
    const link = screen.getByRole('link', { name: 'Open CMS' });
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/cms');
  });
});
