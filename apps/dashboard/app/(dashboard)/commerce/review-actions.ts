'use server';

import { revalidatePath } from 'next/cache';

import { reviewService } from '@sparx/commerce';
import type {
  ModerateReviewInput,
  RespondToReviewInput,
  SubmitAnswerInput,
} from '@sparx/commerce-schemas';

import { runAction, sessionContext, type ActionResult } from './_action-helpers';

export async function moderateReviewAction(
  input: ModerateReviewInput
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await reviewService.moderate(ctx, input);
    revalidatePath('/commerce/reviews');
    revalidatePath(`/commerce/reviews/${input.reviewId}`);
  });
}

export async function respondToReviewAction(
  input: RespondToReviewInput
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await reviewService.respond(ctx, input);
    revalidatePath(`/commerce/reviews/${input.reviewId}`);
  });
}

export async function deleteReviewAction(reviewId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await reviewService.deleteReview(ctx, reviewId);
    revalidatePath('/commerce/reviews');
  });
}

export async function moderateQuestionAction(input: {
  questionId: string;
  status: 'published' | 'rejected';
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    await reviewService.moderateQuestion(ctx, input);
    revalidatePath('/commerce/qa');
    revalidatePath(`/commerce/qa/${input.questionId}`);
  });
}

export async function submitOfficialAnswerAction(
  input: SubmitAnswerInput
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const ctx = await sessionContext();
    const result = await reviewService.submitAnswer(ctx, { ...input, isOfficial: true });
    revalidatePath(`/commerce/qa/${input.questionId}`);
    return result;
  });
}
