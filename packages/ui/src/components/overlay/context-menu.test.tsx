import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './context-menu';

function Fixture({ onSelect }: { onSelect?: () => void }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>right-click me</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onSelect}>Open</ContextMenuItem>
        <ContextMenuItem>Rename</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

describe('ContextMenu', () => {
  it('does not render the menu until the trigger fires contextmenu', () => {
    const onSelect = vi.fn();
    render(<Fixture onSelect={onSelect} />);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders the trigger element', () => {
    render(<Fixture />);
    expect(screen.getByText('right-click me')).toBeInTheDocument();
  });
});
