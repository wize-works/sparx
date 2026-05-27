import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

function Fixture({ variant }: { variant?: 'default' | 'pills' }) {
  return (
    <Tabs defaultValue="overview">
      <TabsList variant={variant}>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="orders">Orders</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">overview panel</TabsContent>
      <TabsContent value="orders">orders panel</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('shows the default panel and hides the others', () => {
    render(<Fixture />);
    expect(screen.getByText('overview panel')).toBeInTheDocument();
    expect(screen.queryByText('orders panel')).not.toBeInTheDocument();
  });

  it('switches the visible panel when another tab is clicked', async () => {
    render(<Fixture />);
    await userEvent.click(screen.getByRole('tab', { name: 'Orders' }));
    expect(screen.getByText('orders panel')).toBeInTheDocument();
    expect(screen.queryByText('overview panel')).not.toBeInTheDocument();
  });

  it('default variant: active trigger uses --module-active for underline + text', () => {
    render(<Fixture />);
    const active = screen.getByRole('tab', { name: 'Overview' });
    expect(active).toHaveAttribute('data-state', 'active');
    expect(active.className).toMatch(/data-\[state=active\]:border-\[var\(--module-active\)\]/);
  });

  it('pills variant: active trigger uses surface bg, no underline classes', () => {
    render(<Fixture variant="pills" />);
    const active = screen.getByRole('tab', { name: 'Overview' });
    expect(active.className).toMatch(/data-\[state=active\]:bg-\[var\(--color-bg-surface\)\]/);
    expect(active.className).not.toMatch(/border-\[var\(--module-active\)\]/);
  });
});
