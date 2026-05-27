import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from './dropdown-menu';

function Fixture({ onSelect }: { onSelect?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Account</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Signed in</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSelect}>
          Profile
          <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu', () => {
  it('is closed by default', () => {
    render(<Fixture />);
    expect(screen.queryByText('Profile')).not.toBeInTheDocument();
  });

  it('opens on trigger click and renders label/separator/items', async () => {
    render(<Fixture />);
    await userEvent.click(screen.getByText('Account'));
    expect(await screen.findByText('Signed in')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Profile/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('fires onSelect when an item is activated, then closes', async () => {
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    await userEvent.click(screen.getByText('Account'));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Profile/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    });
  });
});
