'use client';

// TAKE A NEW BOOKING — the state and the one button; the fields live next door.
//
// A new booking and an existing one are the same appointment at two ages, so the
// pane replaces itself with the record once this succeeds.

import { shownInPlace } from '@wizeworks/query';
import { useEffect, useState } from 'react';
import { Button, useToast } from '@wizeworks/silicaui-react';
import { Icon } from '@piggles/ui';
import { faFloppyDisk } from '@fortawesome/pro-solid-svg-icons';

import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { BookingCreateFields, type BookingDraft } from './booking-create-fields';
import { COLUMN } from './booking-shell';
import {
  fromLocalInputValue,
  localTimezone,
  schedulingErrorMessage,
  useCreateBooking,
  useSchedulingResources,
  useSchedulingServices,
  type CustomerLite,
} from './bookings-data';

export function BookingCreate({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const create = useCreateBooking();
  const services = useSchedulingServices('');
  const resources = useSchedulingResources();

  const [serviceId, setServiceId] = useState('');
  const [startLocal, setStartLocal] = useState('');
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  // A walk-in's name. The form has always invited one — "leave it blank for a
  // booking with no account, a walk-in you are writing down" — and had nowhere
  // to write it, so every walk-in read "No one assigned" for ever after and
  // could never be given a name (issue 139). The API always accepted it.
  const [guestName, setGuestName] = useState('');
  const [partySize, setPartySize] = useState('');
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    ctx.setTitle('New booking');
  }, [ctx]);

  const serviceList = services.data?.items ?? [];
  const resourceList = resources.data ?? [];
  const noServices = services.isSuccess && serviceList.length === 0;

  const startIso = fromLocalInputValue(startLocal);
  const changed =
    serviceId !== '' ||
    startLocal !== '' ||
    customer !== null ||
    guestName.trim() !== '' ||
    partySize !== '' ||
    resourceIds.length > 0 ||
    notes.trim() !== '';
  const canSave = serviceId !== '' && startIso !== null && !create.isPending && !create.isSuccess;

  useDirtySource(
    changed && !create.isSuccess,
    'This booking has not been taken yet. Close anyway?'
  );

  const toggleResource = (id: string) => {
    setResourceIds((current) =>
      current.includes(id) ? current.filter((r) => r !== id) : [...current, id]
    );
  };

  const saveError = create.isError
    ? schedulingErrorMessage(
        create.error,
        'Nothing was booked. That time may have just been taken — try another.'
      )
    : null;

  const submit = () => {
    if (!canSave || !startIso) return;
    const size = Number.parseInt(partySize, 10);
    create.mutate(
      {
        serviceId,
        startAt: startIso,
        timezone: localTimezone(),
        ...(customer ? { customerId: customer.id } : {}),
        // One attendee carrying the written name. Only when there is no account
        // to link: with a customer attached the engine builds the attendee from
        // them, and a name typed here would shadow the record's own.
        ...(!customer && guestName.trim()
          ? { attendees: [{ guestName: guestName.trim(), partySize: 1 }] }
          : {}),
        ...(Number.isFinite(size) && size > 1 ? { partySize: size } : {}),
        resourceIds,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        source: 'dashboard',
      },
      {
        onSuccess: (booking) => {
          // Becomes the manage view for the booking that now exists, rather than a
          // spent form. Toast follows the swap — see afterPaneChange.
          ctx.open('scheduling.bookings.detail', { id: booking.id }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: 'Booking taken', type: 'success' });
          });
        },
        onError: shownInPlace,
      }
    );
  };

  const draft: BookingDraft = {
    serviceId,
    setServiceId,
    startLocal,
    setStartLocal,
    customer,
    setCustomer,
    guestName,
    setGuestName,
    partySize,
    setPartySize,
    resourceIds,
    toggleResource,
    notes,
    setNotes,
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New booking actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            disabled={!canSave}
            loading={create.isPending}
            onClick={submit}
          >
            <Icon glyph={faFloppyDisk} className="size-4" aria-hidden />
            Take booking
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <BookingCreateFields
            ctx={ctx}
            draft={draft}
            serviceList={serviceList}
            servicesLoading={services.isLoading}
            noServices={noServices}
            resourceList={resourceList}
            resourcesLoading={resources.isLoading}
            saveError={saveError}
          />
        </div>
      </div>
    </div>
  );
}
