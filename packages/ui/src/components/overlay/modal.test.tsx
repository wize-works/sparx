import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from './modal';
import { Button } from '../primitives/button';

function ModalFixture({ hideClose = false }: { hideClose?: boolean }) {
  return (
    <Modal>
      <ModalTrigger asChild>
        <Button>Open</Button>
      </ModalTrigger>
      <ModalContent hideClose={hideClose}>
        <ModalHeader>
          <ModalTitle>Delete tenant?</ModalTitle>
          <ModalDescription>Data is retained for 30 days.</ModalDescription>
        </ModalHeader>
      </ModalContent>
    </Modal>
  );
}

describe('Modal', () => {
  it('is closed by default', () => {
    render(<ModalFixture />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens when the trigger is clicked', async () => {
    render(<ModalFixture />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete tenant?')).toBeInTheDocument();
  });

  it('closes when the built-in close button is clicked', async () => {
    render(<ModalFixture />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('hides the close button when hideClose is set', async () => {
    render(<ModalFixture hideClose />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('closes when Escape is pressed', async () => {
    render(<ModalFixture />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
