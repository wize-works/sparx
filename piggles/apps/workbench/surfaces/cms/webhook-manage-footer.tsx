'use client';

// Below the form: the secret to hand to whoever receives the messages, and the
// way to stop them for good.

import { Button, Text } from '@wizeworks/silicaui-react';
import { faTrashCan } from '@fortawesome/pro-solid-svg-icons';
import { Icon } from '@piggles/ui';
import { FormSection } from '../../components/form-section';
import { WebhookSecret } from './webhook-secret';

export function SecretPreview({ value }: { value: string }) {
  return (
    <FormSection
      title="Signing secret"
      description="Whoever receives your notifications uses this to check that a message genuinely came from you."
    >
      <WebhookSecret value={value} />
      <Text className="text-sm">
        For security the full secret is only shown once, at the moment it is set up — this is a
        preview of it. If it has been lost, delete this and set up a new one to get a fresh secret.
      </Text>
    </FormSection>
  );
}

/** Destructive action as a plain row under a divider, not a card with equal
 *  weight to the settings above it. */
export function DeleteRow({ busy, onDelete }: { busy: boolean; onDelete: () => Promise<void> }) {
  return (
    <div className="border-base-300 mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <div className="flex min-w-0 flex-col">
        <Text className="font-medium">Delete this</Text>
        <Text className="text-sm">
          Stops notifications for good. To only pause it, turn Send notifications off above.
        </Text>
      </div>
      <Button
        size="sm"
        variant="outline"
        color="danger"
        loading={busy}
        onClick={() => {
          void onDelete();
        }}
      >
        <Icon glyph={faTrashCan} className="size-4" aria-hidden />
        Delete
      </Button>
    </div>
  );
}
