'use client';

// One notification to other software — set it up, then manage it.
//
// Setting up and managing are the SAME surface in two states, so the form is
// written once: `{ id: 'new' }` collects an address and the events to listen
// for, `{ id }` edits it. Explicit-save only, last write wins, leave-guard on
// an unsaved edit.

import { CreateWebhook } from './webhook-create';
import { ManageWebhook } from './webhook-manage';
import type { SurfaceContext } from '../../lib/surfaces/registry';

export function WebhookDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const id = typeof ctx.params.id === 'string' ? ctx.params.id : 'new';
  return id === 'new' ? <CreateWebhook ctx={ctx} /> : <ManageWebhook ctx={ctx} id={id} />;
}
