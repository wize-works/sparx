'use server';

import { revalidatePath } from 'next/cache';

import { shippingService } from '@sparx/commerce';
import type {
  CreateShippingProfileInput,
  CreateShippingRateInput,
  CreateShippingZoneInput,
} from '@sparx/commerce-schemas';

import { runAction, sessionContext, type ActionResult } from './_action-helpers';

// ─── Zones ───────────────────────────────────────────────────────────

export async function createShippingZoneAction(
  input: CreateShippingZoneInput
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await shippingService.createZone(ctx, input);
    revalidatePath('/commerce/shipping');
    return result;
  });
}

export async function updateShippingZoneAction(
  id: string,
  input: Partial<CreateShippingZoneInput>
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await shippingService.updateZone(ctx, id, input);
    revalidatePath('/commerce/shipping');
    revalidatePath(`/commerce/shipping/zones/${id}`);
  });
}

export async function deleteShippingZoneAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await shippingService.deleteZone(ctx, id);
    revalidatePath('/commerce/shipping');
  });
}

// ─── Profiles ────────────────────────────────────────────────────────

export async function createShippingProfileAction(
  input: CreateShippingProfileInput
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await shippingService.createProfile(ctx, input);
    revalidatePath('/commerce/shipping');
    return result;
  });
}

export async function updateShippingProfileAction(
  id: string,
  input: Partial<CreateShippingProfileInput>
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await shippingService.updateProfile(ctx, id, input);
    revalidatePath('/commerce/shipping');
    revalidatePath(`/commerce/shipping/profiles/${id}`);
  });
}

export async function deleteShippingProfileAction(id: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await shippingService.deleteProfile(ctx, id);
    revalidatePath('/commerce/shipping');
  });
}

// ─── Rates ───────────────────────────────────────────────────────────

export async function createShippingRateAction(
  input: CreateShippingRateInput
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await shippingService.createRate(ctx, input);
    revalidatePath(`/commerce/shipping/zones/${input.zoneId}`);
    return result;
  });
}

export async function deleteShippingRateAction(
  id: string,
  zoneId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await shippingService.deleteRate(ctx, id);
    revalidatePath(`/commerce/shipping/zones/${zoneId}`);
  });
}
