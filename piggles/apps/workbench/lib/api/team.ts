// The team — everyone who can get into this account.
//
// The endpoints behind this keep members and invitations apart, and they are
// right to: a member is a person with a login, an invitation is an email that
// has not been accepted yet, and they live in different tables with different
// lifecycles. But that split is a fact about the database, not about the
// business. To the person running the account there is one list — "who is on my
// team" — and someone who was invited on Tuesday is on it whether or not they
// have got round to clicking the link.
//
// So this module fetches the two lists separately and hands back ONE roster,
// with each row saying which kind it is. The surface renders a single list and
// distinguishes the not-yet-arrived by state, rather than making the operator
// understand a distinction that exists for our convenience.
//
// Every rule the server enforces is mirrored in `roster` helpers rather than
// re-derived per screen — see ../../surfaces/team/roles.ts. The server remains
// the authority; the UI just never offers what it knows will be refused.

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@wizeworks/query';
import { api } from './client';

/** Someone with a login who is already in the account. */
export interface TeamMember {
  id: string;
  userId: string;
  /** People sign up without one surprisingly often — fall back to the email. */
  name: string | null;
  email: string;
  role: string;
  memberType: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  /** 'all' = whatever their role allows. 'selected' = only `modules`. */
  moduleAccessMode: 'all' | 'selected';
  modules: string[];
}

/** An email that has been asked in but has not accepted yet. */
export interface TeamInvitation {
  id: string;
  email: string;
  role: string;
  memberType: string;
  status: string;
  inviterName: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * One row of the roster. The `kind` tag is what lets a single list carry both
 * without the surface guessing from which fields happen to be present — and it
 * narrows the union, so reaching for `lastLoginAt` on an invitation is a type
 * error rather than a silent `undefined` on screen.
 */
export type RosterPerson =
  ({ kind: 'member' } & TeamMember) | ({ kind: 'invitation' } & TeamInvitation);

const MEMBERS_KEY = ['team', 'members'] as const;
const INVITATIONS_KEY = ['team', 'invitations'] as const;

/**
 * Neither list changes on its own — a teammate is added by someone in this
 * account, not by a background process — so there is no poll here at all. A
 * minute of staleness costs nothing and every mutation invalidates anyway.
 */
const STALE_MS = 60_000;

/** Both endpoints answer with `{ items }`, never a bare array, which is why
 *  these use `api.get` rather than `api.list` (whose `total` would be
 *  undefined and would have to be treated as "unknown" forever). */
function fetchMembers() {
  return api.get<{ items: TeamMember[] }>('/v1/team/members').then((r) => r.items);
}

function fetchInvitations() {
  return api.get<{ items: TeamInvitation[] }>('/v1/team/invitations').then((r) => r.items);
}

/**
 * The whole team as one list: members first, then the people still on their way.
 *
 * Members lead because they are who the account actually runs on; invitations
 * trail because they are pending business. Within each group, newest last —
 * the roster reads as the order people joined, which is the order an owner
 * remembers them in.
 */
export function useTeamRoster(): {
  people: RosterPerson[];
  members: TeamMember[];
  invitations: TeamInvitation[];
  ready: boolean;
  /** Either list failed. The surface shows this INSTEAD of a roster — a partial
   *  team read as a complete one is how someone concludes a teammate was
   *  removed when in fact a request timed out. */
  isError: boolean;
  /** True while EITHER list is re-reading, including in the background — what a
   *  RefreshButton reads as "busy". */
  isFetching: boolean;
  /** When the roster last landed, for the RefreshButton's freshness tooltip.
   *  Undefined until something has actually loaded. */
  updatedAt: number | undefined;
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

  const people = useMemo<RosterPerson[]>(
    () => [
      ...(memberRows ?? []).map((member) => ({ kind: 'member' as const, ...member })),
      ...(invitationRows ?? []).map((invitation) => ({
        kind: 'invitation' as const,
        ...invitation,
      })),
    ],
    [memberRows, invitationRows]
  );

  return {
    people,
    members: memberRows ?? [],
    invitations: invitationRows ?? [],
    ready: !members.isLoading && !invitations.isLoading,
    isError: members.isError || invitations.isError,
    isFetching: members.isFetching || invitations.isFetching,
    updatedAt: memberRows ? members.dataUpdatedAt : undefined,
    refetch: () => {
      void members.refetch();
      void invitations.refetch();
    },
  };
}

/**
 * One teammate, read out of the SAME cache entry the roster fills.
 *
 * There is no per-member endpoint, and there does not need to be: the roster is
 * a handful of rows, it is already loaded in nine cases out of ten, and sharing
 * one cache entry means changing someone's role in their own pane updates the
 * roster pane beside it without a second round trip. The query below only
 * actually fetches when a member pane is opened cold — from a deep link, or
 * restored into a fresh window.
 */
export function useTeamMember(memberId: string): {
  member: TeamMember | null;
  ready: boolean;
  isError: boolean;
  /** Loaded fine, but nobody in this account has that id — a removed teammate
   *  whose pane was still open, or a stale deep link. Distinct from an error. */
  missing: boolean;
  /** True while the roster is re-reading, including in the background. */
  isFetching: boolean;
  /** When the roster this member was read out of last landed. */
  updatedAt: number | undefined;
  refetch: () => void;
} {
  const members = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: fetchMembers,
    staleTime: STALE_MS,
  });

  const member = members.data?.find((candidate) => candidate.id === memberId) ?? null;

  return {
    member,
    ready: !members.isLoading,
    isError: members.isError,
    missing: !members.isLoading && !members.isError && member === null,
    isFetching: members.isFetching,
    updatedAt: members.data ? members.dataUpdatedAt : undefined,
    refetch: () => {
      void members.refetch();
    },
  };
}

/** Every mutation touches the roster, and most touch both halves of it, so they
 *  all invalidate the whole `team` branch rather than each guessing which. */
function useInvalidateTeam(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['team'] });
  };
}

export interface InviteInput {
  email: string;
  role: string;
  /** 'staff' unless an outside consultant is being brought in. Server-defaulted. */
  memberType?: string;
}

/** Asks someone in. The response is the pending invitation, which appears in
 *  the roster on the next read. */
export function useInviteTeammate() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: (input: InviteInput) =>
      api.post<TeamInvitation>('/v1/team/invitations', {
        email: input.email,
        role: input.role,
        ...(input.memberType ? { memberType: input.memberType } : {}),
      }),
    onSuccess: invalidate,
  });
}

/** Sends the same invitation again — for the one that went to spam, or expired.
 *  Not a new invitation: the id and the role stay as they were. */
export function useResendInvitation() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: (invitationId: string) =>
      api.post<TeamInvitation>(`/v1/team/invitations/${invitationId}/resend`),
    onSuccess: invalidate,
  });
}

export function useRevokeInvitation() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: (invitationId: string) =>
      api.delete<{ id: string }>(`/v1/team/invitations/${invitationId}`),
    onSuccess: invalidate,
  });
}

export interface MemberPatch {
  role?: string;
  moduleAccessMode?: 'all' | 'selected';
  modules?: string[];
}

/**
 * Changes what one teammate is allowed to do — their role, and which parts of
 * sparx they can reach.
 *
 * PATCH-shaped on purpose: the member pane edits role and module access as two
 * separate decisions, saved separately, and sending only what changed means one
 * save can never quietly revert the other.
 */
export function useUpdateTeamMember() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: ({ memberId, patch }: { memberId: string; patch: MemberPatch }) =>
      api.patch<TeamMember>(`/v1/team/members/${memberId}`, patch),
    onSuccess: invalidate,
  });
}

export function useRemoveTeamMember() {
  const invalidate = useInvalidateTeam();
  return useMutation({
    mutationFn: (memberId: string) => api.delete<{ id: string }>(`/v1/team/members/${memberId}`),
    onSuccess: invalidate,
  });
}
