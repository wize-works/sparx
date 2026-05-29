'use client';

// Stub. Full options editor (axes + values + swatches) lands with the
// variants editor chunk. Placeholder modal keeps the variants panel
// compiling until then.

import { Button, Modal, ModalContent, ModalFooter, ModalHeader, ModalTitle, Text } from '@sparx/ui';
import type { OptionRow } from './variants-panel';

export interface OptionsEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productTitle: string;
  initialOptions: OptionRow[];
  onSaved: () => void;
}

export function OptionsEditorDialog({ open, onOpenChange }: OptionsEditorDialogProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Options</ModalTitle>
        </ModalHeader>
        <div className="px-6 py-3">
          <Text>The options editor lands with the variants editor chunk.</Text>
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
