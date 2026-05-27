import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar, SidebarItem } from './sidebar';

describe('Sidebar', () => {
  it('renders SidebarItem children inside a nav region', () => {
    render(
      <Sidebar aria-label="primary">
        <SidebarItem>Products</SidebarItem>
        <SidebarItem active>Orders</SidebarItem>
      </Sidebar>
    );
    expect(screen.getByRole('button', { name: 'Products' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Orders' })).toBeInTheDocument();
  });

  it('exposes data-active on the active SidebarItem and tints via --module-active-tint', () => {
    render(
      <Sidebar>
        <SidebarItem active>Orders</SidebarItem>
      </Sidebar>
    );
    const active = screen.getByRole('button', { name: 'Orders' });
    expect(active).toHaveAttribute('data-active', 'true');
    expect(active.className).toMatch(/bg-\[var\(--module-active-tint\)\]/);
  });

  it('fires onClick when a SidebarItem is activated', async () => {
    const onClick = vi.fn();
    render(
      <Sidebar>
        <SidebarItem onClick={onClick}>Products</SidebarItem>
      </Sidebar>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Products' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
