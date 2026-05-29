// returnService — RMA workflow. Customer-facing initiation + staff
// inspection + refund/store-credit settlement.

import type {
  ApproveReturnInput,
  CreateReturnRequestInput,
  DenyReturnInput,
  IssueReturnRefundInput,
  RecordReturnInspectionInput,
  ReturnStatus,
} from '@sparx/commerce-schemas';

import type { ServiceContext } from '../errors';
import { notImplemented } from './not-implemented';

export interface ReturnSummary {
  id: string;
  orderId: string;
  customerId: string | null;
  status: ReturnStatus;
  preferredOutcome: string;
  itemCount: number;
  requestedAt: string;
}

export function list(
  _ctx: ServiceContext,
  _filter: { status?: ReturnStatus; orderId?: string; take?: number; skip?: number } = {}
): Promise<{ items: ReturnSummary[]; total: number }> {
  return notImplemented('returnService.list');
}

export function get(_ctx: ServiceContext, _returnId: string): Promise<unknown> {
  return notImplemented('returnService.get');
}

export function create(
  _ctx: ServiceContext,
  _input: CreateReturnRequestInput
): Promise<{ id: string }> {
  return notImplemented('returnService.create');
}

export function approve(
  _ctx: ServiceContext,
  _input: ApproveReturnInput
): Promise<{ labelMediaId: string | null }> {
  return notImplemented('returnService.approve');
}

export function deny(_ctx: ServiceContext, _input: DenyReturnInput): Promise<void> {
  return notImplemented('returnService.deny');
}

export function markReceived(_ctx: ServiceContext, _returnId: string): Promise<void> {
  return notImplemented('returnService.markReceived');
}

export function recordInspection(
  _ctx: ServiceContext,
  _input: RecordReturnInspectionInput
): Promise<void> {
  return notImplemented('returnService.recordInspection');
}

export function issueRefund(
  _ctx: ServiceContext,
  _input: IssueReturnRefundInput
): Promise<{ refundId: string }> {
  return notImplemented('returnService.issueRefund');
}
