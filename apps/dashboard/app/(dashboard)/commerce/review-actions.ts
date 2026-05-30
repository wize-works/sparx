'use server';

import { revalidatePath } from 'next/cache';
import { api } from '@/lib/api-rest-client';
import type {
  ModerateReviewInput,
  RespondToReviewInput,
  SubmitAnswerInput,
} from '@sparx/commerce-schemas';
import type { ActionResult } from './_action-helpers';
import { restAction } from './_rest-action';

export async function moderateReviewAction(
  input: ModerateReviewInput
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/reviews/${input.reviewId}/moderate`, input);
    revalidatePath('/commerce/reviews');
    revalidatePath(`/commerce/reviews/${input.reviewId}`);
  });
}

export async function respondToReviewAction(
  input: RespondToReviewInput
): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/reviews/${input.reviewId}/respond`, input);
    revalidatePath(`/commerce/reviews/${input.reviewId}`);
  });
}

export async function deleteReviewAction(reviewId: string): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.delete<void>(`/v1/commerce/reviews/${reviewId}`);
    revalidatePath('/commerce/reviews');
  });
}

export async function moderateQuestionAction(input: {
  questionId: string;
  status: 'published' | 'rejected';
}): Promise<ActionResult<void>> {
  return restAction(async () => {
    await api.post<{ id: string }>(`/v1/commerce/questions/${input.questionId}/moderate`, input);
    revalidatePath('/commerce/qa');
    revalidatePath(`/commerce/qa/${input.questionId}`);
  });
}

export async function submitOfficialAnswerAction(
  input: SubmitAnswerInput
): Promise<ActionResult<{ id: string }>> {
  return restAction(async () => {
    const result = await api.post<{ id: string }>(
      `/v1/commerce/questions/${input.questionId}/answer`,
      { ...input, isOfficial: true }
    );
    revalidatePath(`/commerce/qa/${input.questionId}`);
    return result;
  });
}
