'use server';

// Header-notice write actions. Every one re-checks `announcement:manage`
// SERVER-SIDE (the nav hiding a link is not authorization), goes through the
// internal seam, writes the wize_admin operator audit, and revalidates the list.
//
// There is no tenant audit row to write and no tenant to attribute this to:
// `platform_announcements` is a platform table with no owner but WizeWorks.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireCapability } from '@wizeworks/operator-auth/next';
import { logOperatorAction } from '@wizeworks/operator-auth';
import {
  OperatorApiError,
  type OperatorAnnouncement,
  type OperatorAnnouncementInput,
  type OperatorAnnouncementSurface,
  type OperatorAnnouncementTone,
} from '@wizeworks/operator';
import { operatorApi } from '@/lib/operator-api';
import { fromLocalInput } from '@/lib/announcements';

const LIST_PATH = '/platform/announcements';

export type AnnouncementActionResult =
  { ok: true; announcement: OperatorAnnouncement } | { ok: false; error: string };

function errorMessage(err: unknown): string {
  return err instanceof OperatorApiError ? err.message : 'Something went wrong. Please try again.';
}

async function audit(
  operator: { id: string; email: string },
  action: string,
  diff: Record<string, unknown>
): Promise<void> {
  try {
    await logOperatorAction({
      operatorId: operator.id,
      operatorEmail: operator.email,
      capability: 'announcement:manage',
      action,
      diff,
    });
  } catch {
    // best-effort audit — never blocks the write it describes
  }
}

/** Read one form into the API's shape. Blank text fields become null, because on
 *  this record blank always means "cleared" and never "the empty string". */
function readForm(form: FormData): OperatorAnnouncementInput {
  // A FormData value can be a File, and `String(File)` is "[object File]" — a
  // value that would save cleanly and read as gibberish on the live site.
  const text = (name: string): string => {
    const raw = form.get(name);
    return typeof raw === 'string' ? raw.trim() : '';
  };
  const nullable = (name: string): string | null => text(name) || null;
  return {
    platformBrand: text('platformBrand'),
    surfaces: form.getAll('surfaces').map(String) as OperatorAnnouncementSurface[],
    message: text('message'),
    linkLabel: nullable('linkLabel'),
    linkHref: nullable('linkHref'),
    tone: (text('tone') || 'primary') as OperatorAnnouncementTone,
    dismissible: form.get('dismissible') !== null,
    startsAt: fromLocalInput(form.get('startsAt')),
    endsAt: fromLocalInput(form.get('endsAt')),
    isActive: form.get('isActive') !== null,
    priority: Number.parseInt(text('priority'), 10) || 0,
  };
}

/**
 * Create or replace, from one form.
 *
 * Both halves of the editor post here because they are the same form: an edit
 * that could only patch SOME fields would quietly leave a cleared link or an
 * unticked surface in place, and the operator would have no way to tell from the
 * screen. A full replace makes what is on the form what is in the row.
 *
 * On success it REDIRECTS to the list rather than returning — redirect() throws,
 * so nothing after it runs, and the caller renders no result state.
 */
export async function saveAnnouncementAction(
  id: string | null,
  form: FormData
): Promise<AnnouncementActionResult> {
  const operator = await requireCapability('announcement:manage');
  const input = readForm(form);

  if (input.surfaces.length === 0) {
    return { ok: false, error: 'Pick at least one place for this to show.' };
  }
  if (!input.message) {
    return { ok: false, error: 'A notice needs something to say.' };
  }

  let saved: OperatorAnnouncement;
  try {
    saved = id
      ? await operatorApi().updateAnnouncement(id, input, operator.id)
      : await operatorApi().createAnnouncement(input, operator.id);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  await audit(operator, id ? 'announcement.update' : 'announcement.create', {
    id: saved.id,
    brand: saved.platformBrand,
    surfaces: saved.surfaces,
    isActive: saved.isActive,
    message: saved.message,
  });
  revalidatePath(LIST_PATH);
  redirect(LIST_PATH);
}

/** The list's on/off switch — patches `isActive` alone, so the dates that record
 *  what was intended survive being taken down in a hurry. */
export async function setAnnouncementActiveAction(
  id: string,
  isActive: boolean
): Promise<AnnouncementActionResult> {
  const operator = await requireCapability('announcement:manage');
  try {
    const saved = await operatorApi().updateAnnouncement(id, { isActive }, operator.id);
    await audit(operator, isActive ? 'announcement.activate' : 'announcement.deactivate', {
      id,
      brand: saved.platformBrand,
    });
    revalidatePath(LIST_PATH);
    return { ok: true, announcement: saved };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export type AnnouncementDeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteAnnouncementAction(id: string): Promise<AnnouncementDeleteResult> {
  const operator = await requireCapability('announcement:manage');
  try {
    await operatorApi().deleteAnnouncement(id, operator.id);
    await audit(operator, 'announcement.delete', { id });
    revalidatePath(LIST_PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
