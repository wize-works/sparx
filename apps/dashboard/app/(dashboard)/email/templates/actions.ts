'use server';

import { revalidatePath } from 'next/cache';

import { api } from '@/lib/api-rest-client';

import type { ActionResult } from '../_lib/rest-action';
import { restAction } from '../_lib/rest-action';
import type { AuthoredTemplateDetail, BuiltinTemplateView } from '../_lib/types';

export async function saveBuiltinOverrideAction(
  key: string,
  input: unknown
): Promise<ActionResult<BuiltinTemplateView>> {
  return restAction(async () => {
    const view = await api.patch<BuiltinTemplateView>(`/v1/email/templates/builtin/${key}`, input);
    revalidatePath('/email/templates');
    revalidatePath(`/email/templates/builtin/${key}`);
    return view;
  });
}

export async function createAuthoredAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const row = await api.post<AuthoredTemplateDetail>('/v1/email/templates', input);
    revalidatePath('/email/templates');
    return { id: row.id };
  });
}

export async function updateAuthoredAction(
  id: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const row = await api.patch<AuthoredTemplateDetail>(`/v1/email/templates/${id}`, input);
    revalidatePath('/email/templates');
    revalidatePath(`/email/templates/${id}`);
    return { id: row.id };
  });
}

export async function archiveAuthoredAction(id: string): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/email/templates/${id}`);
    revalidatePath('/email/templates');
    return { id };
  });
}

interface TestSendResult {
  id: string;
  provider: string;
}

export async function testSendBuiltinAction(
  key: string,
  to: string
): Promise<ActionResult<TestSendResult>> {
  return restAction(() =>
    api.post<TestSendResult>(`/v1/email/templates/builtin/${key}/test-send`, { to })
  );
}

export async function testSendAuthoredAction(
  id: string,
  to: string
): Promise<ActionResult<TestSendResult>> {
  return restAction(() => api.post<TestSendResult>(`/v1/email/templates/${id}/test-send`, { to }));
}
