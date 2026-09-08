'use client';

// What we actually sent, and whether it arrived.
//
// Until this existed the pane could only report the SETTING ("Active"), never
// the result, so a mistyped address looked exactly like a working one.
//
// A stacked list rather than a table: four facts per attempt, one of them a
// sentence, and a table squeezed that sentence to one word per line at 360px.

import { Badge, Button, Text } from '@wizeworks/silicaui-react';
import { InlineWaiting } from '../../components/inline-waiting';
import { FormSection } from '../../components/form-section';
import {
  deliveryState,
  eventLabel,
  formatDateTime,
  useWebhookDeliveries,
  type WebhookDelivery,
} from './webhooks-data';

export function WebhookDeliveries({ id }: { id: string }) {
  const { data, isLoading, isError, refetch } = useWebhookDeliveries(id);
  const items = data?.items ?? [];

  return (
    <FormSection
      title="What has been sent"
      description="The last few messages we tried to send, newest first."
    >
      {isLoading ? <InlineWaiting label="Checking what has been sent…" /> : null}

      {isError ? (
        <div className="flex flex-wrap items-center gap-3">
          <Text className="text-sm">
            We could not check this just now. It is a problem reaching the server, not a problem
            with your notifications.
          </Text>
          <Button
            size="sm"
            variant="soft"
            color="module"
            onClick={() => {
              void refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {!isLoading && !isError && items.length === 0 ? (
        <Text className="text-sm">
          Nothing yet. None of the events you picked has happened since this was set up, so we have
          had nothing to send. This is not a sign that anything is wrong.
        </Text>
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-base-300 flex flex-col divide-y">
          {items.map((delivery) => (
            <DeliveryRow key={delivery.id} delivery={delivery} />
          ))}
        </ul>
      ) : null}
    </FormSection>
  );
}

function DeliveryRow({ delivery }: { delivery: WebhookDelivery }) {
  const state = deliveryState(delivery);
  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge color={state.tone} variant="soft" size="sm">
          {state.label}
        </Badge>
        <Text as="span" className="font-medium">
          {eventLabel(delivery.event_type)}
        </Text>
        <Text as="span" className="text-sm">
          {formatDateTime(delivery.created_at)} · {tries(delivery.attempt_count)}
        </Text>
      </div>
      {delivery.status !== 'delivered' ? (
        <Text className="text-sm">{whyItFailed(delivery)}</Text>
      ) : null}
    </li>
  );
}

function tries(n: number): string {
  return n === 1 ? '1 try' : `${String(n)} tries`;
}

/** The answer that came back, in words rather than a status code — a person
 *  handing this to whoever runs the address needs to know which end failed. */
function whyItFailed(delivery: WebhookDelivery): string {
  const code = delivery.response_status;
  if (code === null) {
    return 'We could not reach that address at all. It may be down, or the address may be wrong.';
  }
  if (code === 404) return 'That address answered, but said there is nothing there (404).';
  if (code === 401 || code === 403) {
    return `That address turned us away (${String(code)}). Whoever runs it may need the signing secret.`;
  }
  if (code >= 500) return `That address answered with an error of its own (${String(code)}).`;
  return `That address refused the message (${String(code)}).`;
}
