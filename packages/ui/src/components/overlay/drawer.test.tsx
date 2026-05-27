import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './drawer';

function Fixture({ side }: { side?: 'left' | 'right' | 'top' | 'bottom' }) {
  return (
    <Drawer>
      <DrawerTrigger>Open</DrawerTrigger>
      <DrawerContent side={side}>
        <DrawerHeader>
          <DrawerTitle>Settings</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>panel body</DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

describe('Drawer', () => {
  it('opens on trigger and closes on Escape', async () => {
    render(<Fixture />);
    await userEvent.click(screen.getByText('Open'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('panel body')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('applies the left-side slide variant', async () => {
    render(<Fixture side="left" />);
    await userEvent.click(screen.getByText('Open'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toMatch(/left-0/);
    expect(dialog.className).toMatch(/slide-in-from-left/);
  });
});
