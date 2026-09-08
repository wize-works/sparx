'use client';

// Partner access — letting an agency or consultant you trust work inside your
// account, with access you can withdraw at any time.
//
// This is the ACCOUNT-OWNER'S side of the relationship, not the partner's portal
// (that is the rest of this folder). A "partner" here is just a team member you
// brought in from outside — a consultant — so the whole surface is the consultant
// slice of the team, reusing the same endpoints rather than inventing a parallel
// access system.
//
// It reads like the Team screen for the same reason it is built like it: an
// invited partner is on this list from the moment you invite them, marked as not
// yet arrived, because "have I given the agency access?" is answered yes whether
// or not they have clicked the email. One list, sorted with the people who have
// access first, and a state badge carrying the difference.
//
// Inviting is a modal — an email and a role, nothing to return to. Changing what
// a partner can reach is the existing teammate pane (there is exactly one such
// editor, and it already does modules and sites), opened beside this list.
// Withdrawing access is a confirm that names the partner and says what it costs.

import { useEffect, useId, useState } from 'react';
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
  Text,
  Tooltip,
  useToast,
} from '@wizeworks/silicaui-react';
import { Handshake, Plus, Send, Settings2, TriangleAlert, UserMinus, X } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { PaneScope } from '../../lib/dock/window-boundary';
import { useViewer } from '../../lib/api/shell-data';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { ASSIGNABLE_ROLES, canManageTeam, roleDescription, roleLabel } from '../team/roles';
import {
  partnerAccessError,
  partnerInitials,
  partnerName,
  partnerState,
  scopeSummary,
  useInvitePartner,
  usePartnerAccess,
  useRemovePartner,
  useResendPartnerInvitation,
  useRevokePartnerInvitation,
  type PartnerPerson,
} from './partner-access-data';

/** The role a new partner gets unless it is changed. View only — the safe
 *  default for an outside adviser, who can look at everything switched on and
 *  change none of it until you decide otherwise. */
const DEFAULT_PARTNER_ROLE = 'viewer';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Inviting a partner — an email and a role, in a popup.
 *
 * Only rendered for someone who can actually invite; the surface decides that
 * once and this simply trusts it. Stays mounted for the surface's whole life so
 * a background refetch of the list cannot take a half-typed address with it.
 */
function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const invite = useInvitePartner();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>(DEFAULT_PARTNER_ROLE);
  const [touched, setTouched] = useState(false);
  const formId = useId();

  // Clear on the way IN, not out: an accidental dismissal reopens to what was
  // typed, while a fresh open always starts clean.
  useEffect(() => {
    if (!open) return;
    setEmail('');
    setRole(DEFAULT_PARTNER_ROLE);
    setTouched(false);
  }, [open]);

  const trimmed = email.trim();
  const malformed = trimmed !== '' && !EMAIL_PATTERN.test(trimmed);
  const error = malformed && touched ? 'Enter an address like sam@agency.com' : null;

  const send = () => {
    setTouched(true);
    if (trimmed === '' || malformed) return;
    invite.mutate(
      { email: trimmed, role },
      {
        onSuccess: () => {
          onClose();
          toast.add({
            title: `Invitation sent to ${trimmed}`,
            description: 'They appear here as invited until they accept and sign in.',
            type: 'success',
          });
        },
        onError: (mutationError) => {
          // Stays open with the address still in it — the likely causes (already
          // a member, already invited) are fixed by editing this same field.
          toast.add({
            title: 'Could not send that invitation',
            description: partnerAccessError(
              mutationError,
              'They may already have access, or already be invited.'
            ),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <PaneScope>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DialogContent className="flex max-h-[calc(100%-2rem)] max-w-md flex-col overflow-hidden">
          <DialogTitle>Invite a partner</DialogTitle>

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
                placeholder="sam@agency.com"
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
              <FieldLabel>What they will be able to do</FieldLabel>
              <NativeSelect
                color="module"
                aria-label="What the partner you are inviting will be able to do"
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
              {/* The plain-language meaning of the chosen role, so the decision
                  is made with its consequence in view rather than from a word. */}
              <Text className="text-sm">{roleDescription(role)}</Text>
            </Field>

            <Text className="text-sm">
              They get an email with a link to join. After they accept, you can narrow exactly which
              parts of your account they reach — and you can withdraw their access completely at any
              time.
            </Text>
          </form>

          <DialogFooter>
            <Button color="neutral" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
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

/** One partner as a card — who they are, what they can reach, and what you can
 *  do about it. */
function PartnerRow({
  person,
  canManage,
  busy,
  onManage,
  onRevoke,
  onCancel,
  onResend,
}: {
  person: PartnerPerson;
  canManage: boolean;
  busy: boolean;
  onManage: () => void;
  onRevoke: () => void;
  onCancel: () => void;
  onResend: () => void;
}) {
  const name = partnerName(person);
  const state = partnerState(person);
  const isMember = person.kind === 'member';

  return (
    <li className="border-base-300 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3">
      <Avatar size="sm" color="neutral" alt={name}>
        {partnerInitials(person)}
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{name}</span>
          <Badge color={state.tone} variant="soft" size="sm">
            {state.label}
          </Badge>
        </div>
        {name === person.email ? null : <span className="truncate text-sm">{person.email}</span>}
        <Text className="text-sm">
          {roleLabel(person.role)} · {scopeSummary(person)}
        </Text>
      </div>

      {canManage ? (
        <div className="flex shrink-0 items-center gap-1">
          {isMember ? (
            <>
              <Button
                size="sm"
                variant="outline"
                color="neutral"
                className="whitespace-nowrap"
                onClick={onManage}
              >
                <Settings2 className="size-4" aria-hidden />
                Manage access
              </Button>
              <Tooltip content="Withdraw this partner's access">
                <Button
                  size="sm"
                  variant="ghost"
                  color="danger"
                  shape="square"
                  disabled={busy}
                  aria-label={`Withdraw ${name}'s access`}
                  onClick={onRevoke}
                >
                  <UserMinus className="size-4" aria-hidden />
                </Button>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip content="Send this invitation again">
                <Button
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  shape="square"
                  disabled={busy}
                  aria-label={`Send the invitation to ${person.email} again`}
                  onClick={onResend}
                >
                  <Send className="size-4" aria-hidden />
                </Button>
              </Tooltip>
              <Tooltip content="Cancel this invitation">
                <Button
                  size="sm"
                  variant="ghost"
                  color="danger"
                  shape="square"
                  disabled={busy}
                  aria-label={`Cancel the invitation to ${person.email}`}
                  onClick={onCancel}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

export function PartnerAccessSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { partners, memberCount, ready, isError, isFetching, dataUpdatedAt, refetch } =
    usePartnerAccess();
  const { data: viewer } = useViewer();

  const resend = useResendPartnerInvitation();
  const revokeInvite = useRevokePartnerInvitation();
  const remove = useRemovePartner();

  const canManage = canManageTeam(viewer?.role);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    ctx.setTitle('Partner access');
  }, [ctx]);

  const busy = resend.isPending || revokeInvite.isPending || remove.isPending;

  const revokeAccess = (person: Extract<PartnerPerson, { kind: 'member' }>) => {
    const name = partnerName(person);
    void confirm({
      title: `Withdraw ${name}'s access?`,
      description: `They lose access to your account immediately and will not be able to sign in. Anything they have already done stays exactly as it is. You can invite ${name} back later, but you will need to set what they can reach again.`,
      confirmLabel: 'Withdraw access',
      cancelLabel: 'Keep their access',
      color: 'danger',
    }).then((ok) => {
      if (!ok) return;
      remove.mutate(person.id, {
        onSuccess: () => {
          toast.add({ title: `${name} no longer has access`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: `Could not withdraw ${name}'s access`,
            description: partnerAccessError(error, 'Nothing changed — they still have access.'),
            type: 'error',
          });
        },
      });
    });
  };

  const cancelInvitation = (person: Extract<PartnerPerson, { kind: 'invitation' }>) => {
    void confirm({
      title: `Cancel the invitation to ${person.email}?`,
      description:
        'The link in their email stops working straight away. If they have not accepted yet, nothing is lost — you can invite them again whenever you like.',
      confirmLabel: 'Cancel it',
      cancelLabel: 'Leave it open',
      color: 'danger',
    }).then((ok) => {
      if (!ok) return;
      revokeInvite.mutate(person.id, {
        onSuccess: () => {
          toast.add({ title: `Invitation to ${person.email} cancelled`, type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not cancel that invitation',
            description: partnerAccessError(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      });
    });
  };

  const resendInvitation = (person: Extract<PartnerPerson, { kind: 'invitation' }>) => {
    resend.mutate(person.id, {
      onSuccess: () => {
        toast.add({
          title: `Invitation sent to ${person.email} again`,
          description: 'The previous link still works — this is the same invitation, resent.',
          type: 'success',
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not send that invitation again',
          description: partnerAccessError(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  // Shown INSTEAD of the list, never above a half-loaded one: a partner list
  // missing rows looks exactly like access that was lost, and someone would act
  // on it.
  if (isError) {
    return (
      <div className={PANE_SHELL}>
        <div className="flex h-full flex-col items-center justify-center p-8">
          <Alert color="error" className="max-w-md">
            <TriangleAlert />
            <AlertContent>
              <AlertTitle>Could not load partner access</AlertTitle>
              <AlertDescription>
                No access has changed — this is a problem reaching the server, not with who can get
                into your account.
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
      </div>
    );
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Partner access controls"
        status={
          <p className="shrink-0 text-sm whitespace-nowrap">
            {partners.length === 0
              ? 'No partners'
              : partners.length === 1
                ? '1 partner'
                : `${String(partners.length)} partners`}
          </p>
        }
        controls={
          <>
            {canManage ? (
              <Button
                color="module"
                size="sm"
                className="ml-auto shrink-0 whitespace-nowrap"
                onClick={() => {
                  setInviting(true);
                }}
              >
                <Plus className="size-4" aria-hidden />
                Invite a partner
              </Button>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            className={canManage ? undefined : 'ml-auto'}
            isFetching={isFetching}
            updatedAt={dataUpdatedAt || undefined}
            onRefresh={refetch}
          />
        }
      />

      {canManage ? (
        <InviteModal
          open={inviting}
          onClose={() => {
            setInviting(false);
          }}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Text>
              Give an agency or consultant you trust access to your account so they can work in it
              alongside you. They sign in with their own email, you decide what they can reach, and
              you can withdraw their access at any time.
            </Text>
          </div>

          <Card className="flex flex-col gap-2 p-3">
            {!ready ? (
              <p className="p-4 text-sm" role="status">
                Loading partner access…
              </p>
            ) : partners.length === 0 ? (
              <EmptyState
                icon={<Handshake className="size-6" aria-hidden />}
                title="No partners have access yet"
                description={
                  canManage
                    ? 'When you work with an agency or a consultant, invite them here so they can help inside your account — with only the access you choose, and none you cannot take back.'
                    : 'Nobody outside your team has been given access to this account.'
                }
                actions={
                  canManage ? (
                    <Button
                      color="module"
                      size="sm"
                      onClick={() => {
                        setInviting(true);
                      }}
                    >
                      <Plus className="size-4" aria-hidden />
                      Invite a partner
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {partners.map((person) => (
                  <PartnerRow
                    key={`${person.kind}:${person.id}`}
                    person={person}
                    canManage={canManage}
                    busy={busy}
                    onManage={() => {
                      // The one teammate editor, opened beside this list — it
                      // already handles role, modules and sites, so partner
                      // access does not build a second scope editor.
                      if (person.kind !== 'member') return;
                      ctx.open(
                        'platform.settings.team.member',
                        { memberId: person.id },
                        { target: 'beside' }
                      );
                    }}
                    onRevoke={() => {
                      if (person.kind === 'member') revokeAccess(person);
                    }}
                    onCancel={() => {
                      if (person.kind === 'invitation') cancelInvitation(person);
                    }}
                    onResend={() => {
                      if (person.kind === 'invitation') resendInvitation(person);
                    }}
                  />
                ))}
              </ul>
            )}
          </Card>

          {memberCount > 0 ? (
            <Text className="px-1 text-sm">
              A partner is an outside consultant, kept apart from your own staff. Use “Manage
              access” to change exactly which parts of your account each one can reach.
            </Text>
          ) : null}

          {!canManage ? (
            <Text className="px-1 text-sm">
              Only owners and admins can invite a partner or change what one can reach.
            </Text>
          ) : null}
        </div>
      </div>
    </div>
  );
}
