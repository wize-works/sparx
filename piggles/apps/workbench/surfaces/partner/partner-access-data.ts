'use client';

// Partner access data — the account-owner's side of letting an agency or
// consultant work inside their account.
//
// This is NOT the partner PROGRAMME (that is data.ts in this folder — the
// referral ledger, tiers and payouts a partner sees). This is the mirror image:
// a business owner granting, and withdrawing, a trusted outsider's access to
// their own account.
//
// There is no separate "partners" system to build for it, and there must not be:
// a delegated partner IS a team member whose `memberType` is `consultant`. Better
// Auth's organization membership already models exactly this — an invitation and
// then a member row, in the same tables the Team screen uses. So this file reuses
// the /v1/team endpoints and simply narrows to the consultant rows, and it shares
// the team query keys so an action here and the Team pane stay in agreement.
//
// Everything the server enforces (only owners/admins may invite or revoke, the
// owner can never be removed) is enforced there; this layer only ever offers the
// consultant subset of what Team already does.

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { apiErrorMessage } from '../../lib/api-error';
import { api } from '../../lib/api/client';
import { moduleLabel } from '../../lib/surfaces/nav';
import { WORKBENCH_MODULES, type WorkbenchModule } from '../../components/module-scope';

/** The memberType the whole surface is scoped to. Staff members and staff
 *  invitations are the Team screen's business, never this one's. */
const CONSULTANT = 'consultant';

/** A consultant who has accepted and now has a login. */
export interface PartnerMember {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: string;
  memberType: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  moduleAccessMode: 'all' | 'selected';
  modules: string[];
  propertyAccessMode: 'all' | 'selected';
  properties: string[];
}

/** A consultant who has been invited but has not accepted yet. */
export interface PartnerInvitation {
  id: string;
  email: string;
  role: string;
  memberType: string;
  status: string;
  inviterName: string;
  expiresAt: string;
  createdAt: string;
}

/** One row of the partner list — a member or an outstanding invitation. The
 *  `kind` tag narrows the union so a field that exists on only one of them is a
 *  type error rather than a silent `undefined`. */
export type PartnerPerson =
  ({ kind: 'member' } & PartnerMember) | ({ kind: 'invitation' } & PartnerInvitation);

// Shared with the Team surface on purpose: both read the same two endpoints, so
// an invite or a revoke here invalidates the roster the Team pane shows, and the
// reverse. Two caches for one truth is how two panes end up disagreeing.
const MEMBERS_KEY = ['team', 'members'] as const;
const INVITATIONS_KEY = ['team', 'invitations'] as const;
const STALE_MS = 60_000;

function fetchMembers() {
  return api.get<{ items: PartnerMember[] }>('/v1/team/members').then((r) => r.items);
}

function fetchInvitations() {
  return api.get<{ items: PartnerInvitation[] }>('/v1/team/invitations').then((r) => r.items);
}

/**
 * Every delegated partner as one list: those with access first, then the ones
 * still invited. Only consultant rows — a staff teammate is not a partner and
 * belongs on the Team screen, not here.
 */
export function usePartnerAccess(): {
  partners: PartnerPerson[];
  memberCount: number;
  ready: boolean;
  isError: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
} {
  const members = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: fetchMembers,
    staleTime: STALE_MS,
  });
  const invitations = useQuery({
    queryKey: INVITATIONS_KEY,
    queryFn: fetchInvitations,
    staleTime: STALE_MS,
  });

  const memberRows = members.data;
  const invitationRows = invitations.data;

  const partners = useMemo<PartnerPerson[]>(() => {
    const consultantMembers = (memberRows ?? [])
      .filter((member) => member.memberType === CONSULTANT)
      .map((member) => ({ kind: 'member' as const, ...member }));
    const consultantInvites = (invitationRows ?? [])
      .filter((invitation) => invitation.memberType === CONSULTANT)
      .map((invitation) => ({ kind: 'invitation' as const, ...invitation }));
    return [...consultantMembers, ...consultantInvites];
  }, [memberRows, invitationRows]);

  return {
    partners,
    memberCount: partners.filter((person) => person.kind === 'member').length,
    ready: !members.isLoading && !invitations.isLoading,
    isError: members.isError || invitations.isError,
    isFetching: members.isFetching || invitations.isFetching,
    dataUpdatedAt: Math.max(members.dataUpdatedAt, invitations.dataUpdatedAt),
    refetch: () => {
      void members.refetch();
      void invitations.refetch();
    },
  };
}

function useInvalidateTeam(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['team'] });
  };
}

export interface InvitePartnerInput {
  email: string;
  role: string;
}

/** Invite a partner — a consultant-type invitation, so they land in this list
 *  and on the Team roster marked as an outside consultant, never as staff. */
export function useInvitePartner() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: (input: InvitePartnerInput) =>
      api.post<PartnerInvitation>('/v1/team/invitations', {
        email: input.email,
        role: input.role,
        memberType: CONSULTANT,
      }),
    onSuccess: invalidate,
  });
}

export function useResendPartnerInvitation() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: (invitationId: string) =>
      api.post<PartnerInvitation>(`/v1/team/invitations/${invitationId}/resend`),
    onSuccess: invalidate,
  });
}

export function useRevokePartnerInvitation() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: (invitationId: string) =>
      api.delete<{ id: string }>(`/v1/team/invitations/${invitationId}`),
    onSuccess: invalidate,
  });
}

/** Withdraw a partner's access entirely — deletes the membership, never the
 *  person, so their past work and their own account survive. */
export function useRemovePartner() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: (memberId: string) => api.delete<{ id: string }>(`/v1/team/members/${memberId}`),
    onSuccess: invalidate,
  });
}

/** The server's own sentence for a 4xx, shown verbatim — these routes explain
 *  the exact problem ("… is already an active member of this team."). A 5xx has
 *  no such sentence, so it falls back to the caller's wording. */
export function partnerAccessError(error: unknown, fallback: string): string {
  return apiErrorMessage(error, fallback);
}

function asModule(slug: string): WorkbenchModule | null {
  return (WORKBENCH_MODULES as readonly string[]).includes(slug) ? (slug as WorkbenchModule) : null;
}

/**
 * "What this partner can reach", as a phrase a business owner reads rather than
 * a count they then have to go and look up. Owners/admins reach everything;
 * anyone limited to chosen areas is described by the names of those areas.
 */
export function scopeSummary(person: PartnerPerson): string {
  if (person.role === 'owner' || person.role === 'admin') return 'Everything in your account';
  if (person.kind === 'invitation') return 'Everything their role allows, once they accept';
  if (person.moduleAccessMode === 'all') return 'Everything their role allows';
  if (person.modules.length === 0) return 'Nothing chosen yet';

  const names = person.modules.map((slug) => {
    const module = asModule(slug);
    return module ? moduleLabel(module) : slug;
  });
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${String(names.length - 3)} more`;
}

/** Where a partner is in their life on this account, as one word plus a color —
 *  state is its own color axis, exactly what a Badge is for. */
export function partnerState(person: PartnerPerson): {
  label: string;
  tone: 'success' | 'warning' | 'error' | 'neutral';
} {
  if (person.kind === 'invitation') {
    if (person.status === 'accepted') return { label: 'Joining', tone: 'success' };
    if (person.status === 'revoked' || person.status === 'cancelled') {
      return { label: 'Cancelled', tone: 'neutral' };
    }
    if (person.status === 'expired' || new Date(person.expiresAt).getTime() < Date.now()) {
      return { label: 'Invitation expired', tone: 'error' };
    }
    return { label: 'Invited', tone: 'warning' };
  }
  if (person.status === 'suspended') return { label: 'Suspended', tone: 'error' };
  if (person.status === 'invited' || person.status === 'pending') {
    return { label: 'Not signed in yet', tone: 'warning' };
  }
  return { label: 'Has access', tone: 'success' };
}

/** Name, falling back to the email — an invited partner is very often known only
 *  by their address until they accept and set a name. */
export function partnerName(person: { name?: string | null; email: string }): string {
  const trimmed = person.name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : person.email;
}

/** Two letters for the avatar chip, always something rather than an empty ring. */
export function partnerInitials(person: { name?: string | null; email: string }): string {
  const source = partnerName(person);
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
