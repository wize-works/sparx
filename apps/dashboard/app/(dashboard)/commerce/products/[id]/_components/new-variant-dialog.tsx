'use client';

// Stub. Full variant creation dialog lands with the variants editor
// chunk. For now this opens a placeholder so the page compiles.

import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle, Text } from '@sparx/ui';
import type { OptionRow } from './variants-panel';

export interface NewVariantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  options: OptionRow[];
  onCreated: () => void;
}

export function NewVariantDialog({ open, onOpenChange }: NewVariantDialogProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Add variant</ModalTitle>
        </ModalHeader>
        <div className="px-6 py-3">
          <Text>Variant creation UI is coming in the next commerce chunk.</Text>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
