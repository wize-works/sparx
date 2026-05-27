import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandPalette,
} from './command-palette';

function Fixture() {
  return (
    <CommandPalette>
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          <CommandItem>Products</CommandItem>
          <CommandItem>Orders</CommandItem>
          <CommandItem>Customers</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandPalette>
  );
}

describe('CommandPalette', () => {
  it('opens via cmd/ctrl+K and shows the input + items', async () => {
    render(<Fixture />);
    expect(screen.queryByPlaceholderText(/Type a command/)).not.toBeInTheDocument();

    await userEvent.keyboard('{Control>}k{/Control}');
    expect(await screen.findByPlaceholderText(/Type a command/)).toBeInTheDocument();
    expect(screen.getByText('Products')).toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
  });

  it('filters items by the input value', async () => {
    render(<Fixture />);
    await userEvent.keyboard('{Control>}k{/Control}');
    // cmdk uses a fuzzy matcher — pick a unique substring so only one item
    // survives. "custo" matches Customers and nothing else.
    await userEvent.type(await screen.findByPlaceholderText(/Type a command/), 'custo');

    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(screen.queryByText('Orders')).not.toBeInTheDocument();
    expect(screen.queryByText('Products')).not.toBeInTheDocument();
  });
});
