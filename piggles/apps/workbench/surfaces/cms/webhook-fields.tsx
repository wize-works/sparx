'use client';

// The fields both the set-up and the manage view collect.

import { useState } from 'react';
import {
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  Switch,
  Text,
} from '@wizeworks/silicaui-react';
import { FormSection } from '../../components/form-section';
import { checkAddress } from './webhook-address';
import type { WebhookDraft } from './webhook-draft';
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_GROUPS } from './webhooks-data';

export function WebhookFields({
  draft,
  onChange,
}: {
  draft: WebhookDraft;
  onChange: (patch: Partial<WebhookDraft>) => void;
}) {
  return (
    <>
      <FormSection
        title="Where to send notifications"
        description="A message is sent to this address every time one of the events below happens."
      >
        <Field>
          <FieldLabel>Name</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={draft.name}
                maxLength={120}
                placeholder="e.g. Tell our stock page"
                onChange={(event) => {
                  onChange({ name: event.target.value });
                }}
              />
            }
          />
          <FieldDescription>
            A short name so you can tell these apart. Just for you — it is never sent anywhere.
          </FieldDescription>
        </Field>

        <AddressField draft={draft} onChange={onChange} />
      </FormSection>

      <EventPicker draft={draft} onChange={onChange} />

      <FormSection
        title="Sending"
        description="Pause this to stop notifications without deleting it."
      >
        <Field>
          <FieldLabel>Send notifications</FieldLabel>
          <FieldControl
            render={
              <Switch
                color="module"
                checked={draft.active}
                onCheckedChange={(next: boolean) => {
                  onChange({ active: next });
                }}
              />
            }
          />
          <FieldDescription>
            On, notifications are sent as events happen. Off, nothing is sent — handy while whoever
            receives them is still setting things up.
          </FieldDescription>
        </Field>
      </FormSection>
    </>
  );
}

/**
 * The address, checked here rather than only at the server.
 *
 * Two behaviours, both on leaving the field so nothing fights the typing:
 * a missing `https://` is ADDED and shown, because that is how people write an
 * address; anything else is refused right on the field, naming the fix. Before
 * this, `stock.example.co.uk/hooks` produced a 422 and a sentence that said
 * only that something had gone wrong (issue 405).
 */
function AddressField({
  draft,
  onChange,
}: {
  draft: WebhookDraft;
  onChange: (patch: Partial<WebhookDraft>) => void;
}) {
  // `settled` rather than `touched`: the message appears when they LEAVE the
  // field and goes away the moment they come back to fix it. Judging every
  // keystroke would be worse than noisy — `Field`'s status changes its subtree,
  // so the control remounts mid-word and the typing goes nowhere. Caught by
  // typing a whole address and finding one letter in the box.
  const [settled, setSettled] = useState(false);
  const result = checkAddress(draft.url);
  const problem = settled && draft.url.trim() !== '' && !result.ok ? result.reason : null;

  const settle = () => {
    setSettled(true);
    if (result.ok && result.tidied) onChange({ url: result.url });
  };

  return (
    <Field status={problem ? 'error' : undefined} statusMessage={problem ?? undefined}>
      <FieldLabel>Address to notify</FieldLabel>
      <FieldControl
        render={
          <Input
            color="module"
            className="font-mono text-sm"
            value={draft.url}
            placeholder="https://example.com/updates"
            autoComplete="off"
            spellCheck={false}
            inputMode="url"
            onFocus={() => {
              setSettled(false);
            }}
            onChange={(event) => {
              onChange({ url: event.target.value });
            }}
            onBlur={settle}
          />
        }
      />
      <FieldDescription>
        The web address we send each notification to. Whoever is building on your content gives you
        this. If you leave off the https:// we will add it.
      </FieldDescription>
    </Field>
  );
}

function EventPicker({
  draft,
  onChange,
}: {
  draft: WebhookDraft;
  onChange: (patch: Partial<WebhookDraft>) => void;
}) {
  const toggle = (key: string, checked: boolean) => {
    const next = new Set(draft.events);
    if (checked) next.add(key);
    else next.delete(key);
    onChange({ events: next });
  };

  return (
    <FormSection
      title="What should trigger a notification?"
      description="Pick one or more. A message is sent every time one of the events you tick happens."
    >
      {WEBHOOK_EVENT_GROUPS.map((group) => (
        <fieldset key={group} className="flex flex-col gap-3">
          <legend className="font-medium">{group}</legend>
          {WEBHOOK_EVENTS.filter((event) => event.group === group).map((event) => (
            <label key={event.key} className="flex items-start gap-3">
              <Checkbox
                color="module"
                className="mt-1 shrink-0"
                checked={draft.events.has(event.key)}
                aria-label={event.label}
                onChange={(changed) => {
                  toggle(event.key, changed.target.checked);
                }}
              />
              <span className="flex min-w-0 flex-col">
                <Text as="span" className="font-medium">
                  {event.label}
                </Text>
                <Text as="span" className="text-sm">
                  {event.description}
                </Text>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
      {draft.events.size === 0 ? (
        <Text className="text-warning text-sm">
          Nothing is ticked, so there would be nothing to notify about. Choose at least one.
        </Text>
      ) : null}
    </FormSection>
  );
}
