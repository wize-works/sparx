import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

function Fixture() {
  return (
    <Popover>
      <PopoverTrigger>Open</PopoverTrigger>
      <PopoverContent>Quick action</PopoverContent>
    </Popover>
  );
}

describe('Popover', () => {
  it('is closed by default', () => {
    render(<Fixture />);
    expect(screen.queryByText('Quick action')).not.toBeInTheDocument();
  });

  it('opens on trigger click', async () => {
    render(<Fixture />);
    await userEvent.click(screen.getByText('Open'));
    expect(await screen.findByText('Quick action')).toBeInTheDocument();
  });

  it('closes when Escape is pressed', async () => {
    render(<Fixture />);
    await userEvent.click(screen.getByText('Open'));
    await screen.findByText('Quick action');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByText('Quick action')).not.toBeInTheDocument();
    });
  });
});
