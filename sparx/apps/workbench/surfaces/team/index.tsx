'use client';

// The team — one list of everyone who can get into this account.
//
// The single decision that shapes this screen: an invitation is a PERSON, not a
// record type. The API keeps members and invitations in separate tables and
// separate endpoints, and every version of this screen anyone has built puts
// them in separate boxes because of it — a roster up top, a "Pending
// invitations" panel underneath, and an owner who has to check two places to
// answer "is Sarah on my team?".
//
// She either is or she isn't. If she was invited yesterday she is on the team
// and hasn't logged in yet, which is a STATE, not a category. So there is one
// list here, sorted like a team, and the people who haven't arrived wear a badge
// saying so. That is also why inviting someone is two controls in a small popup
// rather than a wizard or a surface of its own: adding someone to a team is one
// sentence — this email, that job — and anything more ceremonious than that is
// ceremony.
//
// The invite form used to sit permanently above the list. It was always on
// screen and almost never in use, which cost the roster a chunk of its height
// every second of every day to serve the rare minute someone hires. It now
// lives behind the one button in the toolbar, which is how every other list in
// this app offers its "add a thing" action — the same bordered row, the same
// plain count on the left, the same module-colored button on the right.
//
// Opening a person opens a PANE (`target: 'beside'`). This list never renders
// the detail itself, which is the workbench's founding rule: the roster offers
// "open this teammate" and the operator decides where that lands — beside the
// list, on another monitor, or as a tab they flick back to. Two teammates open
// side by side to compare is a legitimate thing to want, and it costs nothing
// to allow.

import { useEffect, useId, useMemo, useState } from 'react';
import {
  Alert,
  AlertActions,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  EmptyState,
  Field,
  FieldLabel,
  FieldStatus,
  Input,
  NativeSelect,
  SearchInput,
  Table,
  Text,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Plus, Send, TriangleAlert, UserX, Users, X } from 'lucide-react';
import { ListPagination, type PageSize } from '../../components/list-pagination';
import { PaneScope } from '../../lib/dock/window-boundary';
import { useViewer } from '../../lib/api/shell-data';
import { moduleLabel } from '../../lib/surfaces/nav';
import { WORKBENCH_MODULES, type WorkbenchModule } from '../../components/module-scope';
import {
  useInviteTeammate,
  useRemoveTeamMember,
  useResendInvitation,
  useRevokeInvitation,
  useTeamRoster,
  type RosterPerson,
} from '../../lib/api/team';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import {
  ASSIGNABLE_ROLES,
  canModifyMember,
  canManageTeam,
  personInitials,
  personName,
  roleLabel,
} from './roles';

/** The role a new teammate gets unless someone changes it. Editor, because it
 *  is the role that lets a person do the job they were hired for without
 *  handing them the team and the billing — the safe useful middle. */
const DEFAULT_INVITE_ROLE = 'editor';

/** Where a person is in their life on this team, as one word plus a color.
 *
 *  State is its own color axis — it is not the module hue and not decoration,
 *  it is the fact that Sarah hasn't accepted yet. That is exactly what a Badge
 *  is for: state ON a thing. */
interface PersonState {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
}

function personState(person: RosterPerson): PersonState {
  if (person.kind === 'invitation') {
    // An invitation that ran out is not pending — nothing will happen to it
    // ever again, and the only fix is to send it afresh. Saying "Invited" would
    // leave someone waiting on an email that is already dead.
    if (person.status === 'accepted') return { label: 'Joining', tone: 'success' };
    if (person.status === 'revoked' || person.status === 'cancelled') {
      return { label: 'Cancelled', tone: 'neutral' };
    }
    if (person.status === 'expired' || new Date(person.expiresAt).getTime() < Date.now()) {
      return { label: 'Invitation expired', tone: 'danger' };
    }
    return { label: 'Invited', tone: 'warning' };
  }

  if (person.status === 'suspended') return { label: 'Suspended', tone: 'danger' };
  // `invited` is the stored value (members.status is active | invited |
  // suspended — see 03-auth-org.prisma). `pending` is accepted too because the
  // Better Auth org plugin writes this row on acceptance and the dashboard half
  // of the platform still speaks that word; treating one of them as unknown
  // would fall through to "Active" and show someone who has never signed in as
  // though they were working in here today.
  if (person.status === 'invited' || person.status === 'pending') {
    return { label: 'Not signed in yet', tone: 'warning' };
  }
  return { label: 'Active', tone: 'success' };
}

function asModule(slug: string): WorkbenchModule | null {
  return (WORKBENCH_MODULES as readonly string[]).includes(slug) ? (slug as WorkbenchModule) : null;
}

/**
 * "What can this person reach", as a phrase rather than a count.
 *
 * "3 modules" is a number an owner then has to go and look up. The names of the
 * areas are the answer, so they are what the column says — truncated only once
 * the list gets long enough to stop being readable at a glance.
 */
function describeReach(person: RosterPerson): string {
  if (person.role === 'owner' || person.role === 'admin') return 'Everything';
  if (person.kind === 'invitation') return 'Everything their role allows';
  if (person.moduleAccessMode === 'all') return 'Everything their role allows';
  if (person.modules.length === 0) return 'Nothing chosen yet';

  const names = person.modules.map((slug) => {
    const module = asModule(slug);
    return module ? moduleLabel(module) : slug;
  });
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} and ${String(names.length - 3)} more`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Asking someone in — an email and a job, in a popup.
 *
 * Only ever rendered for someone who can actually invite; the roster decides
 * that once, and this component simply trusts it. An admin-only control drawn
 * disabled for everyone else is a worse answer than no control: it advertises a
 * capability and then refuses it, which reads as a fault rather than a rule.
 *
 * This stays MOUNTED while the roster reloads behind it. That is deliberate:
 * the two queries feeding the list refetch on their own schedule, and a form
 * that only exists while some other request is settled is a form that throws
 * away a half-typed address the moment the roster happens to refresh. Nothing
 * in here reads the roster, so nothing in here has any business reacting to it.
 */
function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const invite = useInviteTeammate();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>(DEFAULT_INVITE_ROLE);
  const [touched, setTouched] = useState(false);
  // Two of these panes can be open at once, so the id linking the footer button
  // to the form has to be unique per instance, not a hardcoded string.
  const formId = useId();

  // Wipe the form each time the popup opens rather than each time it closes.
  // Closing is the moment an accidental Escape lands, and clearing on the way
  // out would mean an operator who dismissed by mistake reopens to an empty
  // box. Clearing on the way IN gives the same guarantee — a second invite
  // always starts clean — without punishing the misfire.
  useEffect(() => {
    if (!open) return;
    setEmail('');
    setRole(DEFAULT_INVITE_ROLE);
    setTouched(false);
  }, [open]);

  const trimmed = email.trim();
  const malformed = trimmed !== '' && !EMAIL_PATTERN.test(trimmed);
  // Held until blur, or the field goes red halfway through the first word.
  const error = malformed && touched ? 'Enter an address like sarah@yourbusiness.com' : null;

  const send = () => {
    setTouched(true);
    if (trimmed === '' || malformed) return;
    invite.mutate(
      { email: trimmed, role },
      {
        onSuccess: () => {
          // Close first, then say so. The roster underneath already has the new
          // person on it by the time the popup is gone, so the toast lands on a
          // list that visibly proves it — rather than over a form still sitting
          // open, which reads as though something is left to do.
          onClose();
          toast.add({
            title: `Invitation sent to ${trimmed}`,
            description: 'They will appear in your team as invited until they accept it.',
            type: 'success',
          });
        },
        onError: () => {
          // The popup stays open on failure, with what they typed still in it.
          // The two likely causes are both fixed by editing this same address.
          toast.add({
            title: 'Could not send that invitation',
            description: 'They may already be on your team, or already invited. Check your team.',
            type: 'error',
          });
        },
      }
    );
  };

  return (
    // PaneScope portals the dialog into the pane that opened it. In a
    // multi-document interface a modal belongs to ONE document: inviting from
    // the team roster must not black out whatever sits in the pane beside it.
    <PaneScope>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          // Every dismissal — Escape, Cancel, a click outside — arrives here,
          // and all of them simply close. Nothing has been sent and nothing has
          // been lost that took longer than a sentence to type, so a "discard
          // your changes?" question would cost more than it protects.
          if (!next) onClose();
        }}
      >
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-md flex-col overflow-hidden">
          <DialogTitle>Invite someone</DialogTitle>

          {/* px-1 keeps the focus ring clear of the scroll edge; the body is
              what scrolls, so the footer stays reachable in a short pane. */}
          <form
            id={formId}
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <Field>
              <FieldLabel>Their email address</FieldLabel>
              <Input
                color={error ? 'error' : 'module'}
                type="email"
                value={email}
                placeholder="sarah@yourbusiness.com"
                autoComplete="off"
                onBlur={() => {
                  setTouched(true);
                }}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
              />
              {error ? <FieldStatus status="error">{error}</FieldStatus> : null}
            </Field>

            <Field>
              <FieldLabel>What they will do</FieldLabel>
              <NativeSelect
                color="module"
                aria-label="Role for the person you are inviting"
                value={role}
                onChange={(event) => {
                  setRole(event.target.value);
                }}
              >
                {ASSIGNABLE_ROLES.map((assignable) => (
                  <option key={assignable} value={assignable}>
                    {roleLabel(assignable)}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            {/* The one thing people get wrong about invitations, said once,
                where the decision is made rather than in a help article. */}
            <Text className="text-sm">
              They will get an email with a link to join. You can change what they are allowed to do
              at any time, and you can take their access away entirely.
            </Text>
          </form>

          <DialogFooter>
            <Button color="neutral" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {/* Associated with the form by id rather than nested inside it: the
                footer is a sibling of the scrolling body, so the button cannot
                physically live in the <form> it submits. `form=` is what keeps
                Enter in the email field doing the same thing as clicking here. */}
            <Button
              type="submit"
              form={formId}
              color="module"
              size="sm"
              disabled={invite.isPending || trimmed === ''}
            >
              {invite.isPending ? 'Sending…' : 'Send invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PaneScope>
  );
}

export function TeamSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { people, ready, isError, refetch } = useTeamRoster();
  const { data: viewer } = useViewer();

  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();
  const remove = useRemoveTeamMember();

  const canManage = canManageTeam(viewer?.role);
  const [inviting, setInviting] = useState(false);
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [page, setPage] = useState(1);

  // Filtered here rather than at the server, on purpose. A team is a handful of
  // people — nine, twenty, rarely more — and the whole roster is already sitting
  // in memory by the time anyone types. Asking the API for it again per keystroke
  // would buy nothing and cost a spinner between every letter, so the box filters
  // what is already on screen and answers instantly.
  //
  // It searches the three things a person would actually type looking for someone:
  // their name, their email address, and the name of their job here. The last one
  // is what makes typing "editor" list the editors, which is how an owner asks
  // "who can change my products?" without knowing there is a Role column to sort.
  // Email matters most for the people who have only been INVITED — an address is
  // very often the only thing known about them yet, since they have not signed in
  // to give us a name.
  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    if (query === '') return people;
    return people.filter((person) =>
      [personName(person), person.email, roleLabel(person.role)].some((field) =>
        field.toLowerCase().includes(query)
      )
    );
  }, [people, query]);

  // Paged here rather than at the server, and this is NOT an oversight to be
  // tidied up later — it is forced by the two facts above it.
  //
  // FIRST, and most importantly: the search box directly above is client-side,
  // and paging has to sit on the SAME side of the wire as the filter it pages.
  // Ask the server for rows 51–100 while the box filters what came back, and the
  // box is only ever searching the page you happen to be standing on — type a
  // colleague's name and they are "not found" because they are on page 2. The
  // invoice list has the mirror-image version of this hazard written at the top
  // of its sort logic: the moment a list can page, a CLIENT-side sort of a
  // SERVER-fetched window silently sorts one page and presents it as the whole
  // answer. Same rule, both directions — the filter, the sort and the paging
  // must all happen in the same place. So if you are here to "fix" this by
  // adding skip/take to the roster endpoints, you have to move the search there
  // in the same change, or you will break searching without breaking a test.
  //
  // SECOND, the reason we get to choose the easy side: the whole roster is
  // already in memory. It is one list merged from two endpoints (members and
  // invitations, two tables served separately), and offset-paging the union of
  // two independently-served queries is not a coherent thing to ask for — "rows
  // 51–100 of these two tables interleaved" has no answer either endpoint can
  // give. Team size is bounded anyway (Better Auth caps membership at 1000), so
  // the entire team arrives in two requests and there is nothing to stream.
  //
  // The slice is taken from the FILTERED list, so the pager's "of N" counts what
  // matches the search — which is the same number the toolbar prints as "3 of
  // 12 people". Two counts describing the same list must never disagree; a range
  // reading "1–3 of 12" under a list of three is how someone concludes rows are
  // missing.
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  // Clamped rather than trusted. Page resets to 1 whenever the search changes
  // (see `changeSearch`), but the roster can also shrink underneath a settled
  // search — removing someone or cancelling an invitation are both done from
  // THIS list — and losing the last row of page 2 would otherwise leave an
  // operator staring at an empty table with no hint that the fix is to page back.
  const currentPage = Math.min(page, pageCount);
  const skip = (currentPage - 1) * pageSize;
  const paged = visible.slice(skip, skip + pageSize);

  /** Every route back to the search box goes through here, because changing what
   *  matches has to send you back to the first page. Stay on page 3 while the
   *  result set narrows to four people and the table is simply blank — the rows
   *  are all on page 1, and nothing on screen says so. */
  const changeSearch = (next: string) => {
    setSearch(next);
    setPage(1);
  };

  const removeMember = (person: Extract<RosterPerson, { kind: 'member' }>) => {
    const name = personName(person);
    void confirm({
      // The confirm NAMES them. "Remove this member?" is how the wrong person
      // gets removed from a list of eight rows that all look alike.
      title: `Remove ${name} from your team?`,
      description: `They lose access to this account immediately and will not be able to sign in. Their past work stays exactly as it is. You can invite ${name} back later, but their choices about what they could reach will have to be set again.`,
      confirmLabel: 'Remove them',
      cancelLabel: 'Keep them',
      color: 'danger',
    }).then((ok) => {
      if (!ok) return;
      remove.mutate(person.id, {
        onSuccess: () => {
          toast.add({ title: `${name} no longer has access`, type: 'success' });
        },
        onError: () => {
          toast.add({
            title: `Could not remove ${name}`,
            description: 'Nothing changed — they still have access. Try again in a moment.',
            type: 'error',
          });
        },
      });
    });
  };

  const revokeInvitation = (person: Extract<RosterPerson, { kind: 'invitation' }>) => {
    void confirm({
      title: `Cancel the invitation to ${person.email}?`,
      description:
        'The link in their email stops working straight away. If they have not seen it yet, nothing has been lost — you can invite them again whenever you like.',
      confirmLabel: 'Cancel it',
      cancelLabel: 'Leave it open',
      color: 'danger',
    }).then((ok) => {
      if (!ok) return;
      revoke.mutate(person.id, {
        onSuccess: () => {
          toast.add({ title: `Invitation to ${person.email} cancelled`, type: 'success' });
        },
        onError: () => {
          toast.add({ title: 'Could not cancel that invitation', type: 'error' });
        },
      });
    });
  };

  const resendInvitation = (person: Extract<RosterPerson, { kind: 'invitation' }>) => {
    resend.mutate(person.id, {
      onSuccess: () => {
        toast.add({
          title: `Invitation sent to ${person.email} again`,
          description: 'The previous link still works — this is the same invitation, resent.',
          type: 'success',
        });
      },
      onError: () => {
        toast.add({ title: 'Could not send that invitation again', type: 'error' });
      },
    });
  };

  // Shown INSTEAD of the roster, never above a half-loaded one. A team list
  // missing rows looks exactly like a team that lost people, and someone will
  // act on it — re-inviting a colleague who never left.
  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <Alert color="error" className="max-w-md">
          <TriangleAlert />
          <AlertContent>
            <AlertTitle>Could not load your team</AlertTitle>
            <AlertDescription>
              Nobody has been removed and no invitation has been lost — this is a problem reaching
              the server, not with your team.
            </AlertDescription>
          </AlertContent>
          <AlertActions>
            <Button
              size="sm"
              color="error"
              variant="soft"
              onClick={() => {
                refetch();
              }}
            >
              Try again
            </Button>
          </AlertActions>
        </Alert>
      </div>
    );
  }

  const busy = resend.isPending || revoke.isPending || remove.isPending;

  return (
    <div className={PANE_SHELL}>
      {/* The toolbar is the same row every list in this app wears: what you are
          looking at on the left, what you can do about it on the right. It is
          shown to EVERYONE, because the count is a fact about the team rather
          than a privilege — only the button is gated. Someone who cannot invite
          still gets to see that there are nine people here.

          The count is people, not members: an invited colleague is on this list
          and is one of the rows being counted, so counting only accepted
          members would print a number the list visibly contradicts.

          While a search is running the count says "3 of 12 people" instead of
          "3 people". The number next to a filtered list has to describe the list
          — otherwise it reads as though nine colleagues just disappeared — but it
          also has to keep the real size of the team visible, because that is the
          fact someone came here for. Saying both is the only version that is
          true in either reading. */}
      <PaneToolbar
        label="Team list controls"
        search={
          <SearchInput
            size="sm"
            aria-label="Search your team by name, email address or role"
            placeholder="Search people…"
            value={search}
            onValueChange={changeSearch}
            className="max-w-xs min-w-0"
          />
        }
        status={
          <p className="shrink-0 text-sm whitespace-nowrap">
            {query === ''
              ? people.length === 1
                ? '1 person'
                : `${String(people.length)} people`
              : `${String(visible.length)} of ${String(people.length)} ${people.length === 1 ? 'person' : 'people'}`}
          </p>
        }
        controls={
          <>
            {/* `min-w-0` lets the search box give up width as the pane narrows.
            Without it a flex item refuses to shrink below its content, so the
            box holds its size and everything to its right gets squeezed
            instead — which is what made the count wrap. */}
            {/* Never wraps and never shrinks: "12 of 33 people" breaking across two
            lines makes the toolbar taller than the rows it describes, and this
            is a pane the operator can drag to any width they like. The search
            box above yields space first. */}
            <div className="flex-1" />
            {canManage ? (
              // Same reasoning as the count: the label stays on one line and the
              // button keeps its width, so a narrow pane shrinks the search box
              // rather than turning the primary action into two stacked words.
              <Button
                color="module"
                size="sm"
                className="shrink-0 whitespace-nowrap"
                onClick={() => {
                  setInviting(true);
                }}
              >
                <Plus className="size-4" aria-hidden />
                Invite someone
              </Button>
            ) : null}
          </>
        }
      />

      {/* Mounted for the whole life of the surface rather than swapped in when
          `inviting` flips, so the roster refetching underneath cannot take a
          half-typed address with it. `canManage` still guards it — someone who
          cannot invite has no way to open it and no reason to carry it. */}
      {canManage ? (
        <InviteModal
          open={inviting}
          onClose={() => {
            setInviting(false);
          }}
        />
      ) : null}

      {/* The pane is the recessed surface; the roster sits on it as its own
          sheet, separated by the gap rather than by a rule. */}
      <div className="bg-base-200 @container flex min-h-0 flex-1 flex-col gap-2">
        <Card className="min-h-0 flex-1 overflow-y-auto">
          {!ready ? (
            <p className="p-4" role="status">
              Loading your team…
            </p>
          ) : people.length === 0 ? (
            <EmptyState
              icon={<Users className="size-6" aria-hidden />}
              title="It is just you for now"
              description={
                canManage
                  ? 'Use "Invite someone" above and they will appear here straight away, marked as invited until they accept.'
                  : 'Nobody else has been added to this account yet.'
              }
            />
          ) : visible.length === 0 ? (
            /* A search that found nobody is NOT an empty team, and the two must
                                                   never share a message. "It is just you for now" told to an owner
                                                   with twelve colleagues — who has simply mistyped a name — reads as
                                                   though the account lost everybody. This one says what actually
                                                   happened, quotes back the words that found nothing so the typo is
                                                   visible, and offers the way out: put the whole team back. */
            <EmptyState
              icon={<Users className="size-6" aria-hidden />}
              title={`Nobody here matches "${search.trim()}"`}
              description="Try part of their name, their email address, or the job they do here — like Editor."
              actions={
                <Button
                  color="neutral"
                  variant="soft"
                  size="sm"
                  onClick={() => {
                    changeSearch('');
                  }}
                >
                  Show everyone
                </Button>
              }
            />
          ) : (
            <Table size="sm" hover>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th className="hidden @2xl:table-cell">What they can reach</th>
                  <th>State</th>
                  {canManage ? <th className="text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {paged.map((person) => {
                  const name = personName(person);
                  const state = personState(person);
                  const isMember = person.kind === 'member';
                  const isSelf = isMember && person.userId === viewer?.userId;
                  const openable = isMember;
                  const modifiable =
                    isMember && canModifyMember(viewer?.role, viewer?.userId, person);

                  const open = () => {
                    if (!isMember) return;
                    // 'beside', because reading a teammate is something you do
                    // WITH the roster, not instead of it — and because two of
                    // these open at once is how you compare what two people can
                    // reach. The surface never renders the detail itself.
                    ctx.open(
                      'platform.settings.team.member',
                      { memberId: person.id },
                      { target: 'beside' }
                    );
                  };

                  return (
                    <tr
                      key={`${person.kind}:${person.id}`}
                      className={openable ? 'cursor-pointer' : ''}
                      {...(openable
                        ? {
                            tabIndex: 0,
                            role: 'button',
                            onClick: open,
                            onKeyDown: (event: React.KeyboardEvent) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.preventDefault();
                              open();
                            },
                          }
                        : {})}
                    >
                      <td>
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar size="sm" color="neutral" alt={name}>
                            {personInitials(person)}
                          </Avatar>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">
                              {name}
                              {isSelf ? ' (you)' : ''}
                            </span>
                            {/* Only when the name is not already the email —
                              printing it twice is noise, not detail. */}
                            {name === person.email ? null : (
                              <span className="truncate text-sm">{person.email}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{roleLabel(person.role)}</td>
                      <td className="hidden max-w-64 truncate @2xl:table-cell">
                        {describeReach(person)}
                      </td>
                      <td>
                        <Badge color={state.tone} variant="soft" size="sm">
                          {state.label}
                        </Badge>
                      </td>
                      {canManage ? (
                        <td className="text-right">
                          {/* Each button stops the click reaching the row, or
                            acting on someone also OPENS them — a confirm
                            dialog appearing over a pane that just split is
                            disorienting at exactly the wrong moment. Stopping
                            it on the buttons rather than on a wrapper keeps
                            every interactive thing here a real <button>. */}
                          <div className="flex justify-end gap-1">
                            {person.kind === 'invitation' ? (
                              <>
                                <Tooltip content="Send this invitation again">
                                  <Button
                                    color="neutral"
                                    variant="ghost"
                                    size="sm"
                                    shape="square"
                                    disabled={busy}
                                    aria-label={`Send the invitation to ${person.email} again`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      resendInvitation(person);
                                    }}
                                  >
                                    <Send className="size-4" aria-hidden />
                                  </Button>
                                </Tooltip>
                                <Tooltip content="Cancel this invitation">
                                  <Button
                                    color="danger"
                                    variant="ghost"
                                    size="sm"
                                    shape="square"
                                    disabled={busy}
                                    aria-label={`Cancel the invitation to ${person.email}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      revokeInvitation(person);
                                    }}
                                  >
                                    <X className="size-4" aria-hidden />
                                  </Button>
                                </Tooltip>
                              </>
                            ) : modifiable ? (
                              <Tooltip content="Remove from the team">
                                <Button
                                  color="danger"
                                  variant="ghost"
                                  size="sm"
                                  shape="square"
                                  disabled={busy}
                                  aria-label={`Remove ${name} from the team`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    removeMember(person);
                                  }}
                                >
                                  <UserX className="size-4" aria-hidden />
                                </Button>
                              </Tooltip>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        {/* Outside the Card, so it does not scroll away with the rows — the
            control that moves you to page 4 is useless if reaching it means
            scrolling to the bottom of page 3.

            Hidden entirely when there is nothing to page. An empty team and a
            search that found nobody both already have an EmptyState saying what
            happened and what to do about it; putting "Nothing to show" and a
            rows-per-page picker underneath that is a second, quieter voice
            answering a question nobody asked, about a list that isn't there.
            It is also the only reading under which the pager cannot contradict
            the empty state — it says nothing at all. */}
        {ready && visible.length > 0 ? (
          <div className="shrink-0">
            <ListPagination
              shown={paged.length}
              firstRow={paged.length === 0 ? 0 : skip + 1}
              total={visible.length}
              page={currentPage}
              pageSize={pageSize}
              // Every row is already in memory, so there is no wider window to
              // fetch — "Load more" would be a button that loads nothing. The
              // numbered pages do the whole job here.
              canLoadMore={false}
              busy={!ready}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                // Page 3 at 25 rows is somewhere else entirely at 100, so the
                // honest answer is to start again from the top rather than
                // guess which of the old rows the operator was looking at.
                setPage(1);
              }}
            />
          </div>
        ) : null}

        {/* Said once, at the bottom, because it is the question the roster raises
          and does not answer: why can't I edit the owner, or myself. */}
        {canManage ? (
          <Text className="shrink-0 px-1 text-sm">
            Open anyone to change their role or limit what they can reach. The owner cannot be
            changed, and you cannot change your own role or remove yourself — that is what stops an
            account locking everybody out.
          </Text>
        ) : (
          <Text className="shrink-0 px-1 text-sm">
            Only owners and admins can invite people or change what anyone is allowed to do.
          </Text>
        )}
      </div>
    </div>
  );
}
