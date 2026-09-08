// What each role actually MEANS, said in words a business owner uses.
//
// The roles themselves are the platform's vocabulary (`ORG_ROLES` in
// @wizeworks/auth) and are not up for reinterpretation here. What lives in this
// file is the explanation — and it is the whole point of the team screens.
//
// "Editor" tells nobody anything. Someone deciding whether their new bookkeeper
// should be an editor or a viewer is asking one question: what will this person
// be able to see and change? So every description below answers exactly that,
// in a sentence, including what the role CANNOT do — because the thing an owner
// is actually worried about is who can see the money and who can email their
// customers. A role list that only says what each role can do makes them guess
// at the rest, and people guess generously.
//
// Deliberately not shared with the dashboard's copy of this vocabulary: that
// one is written for a settings page, and these screens are not that page.

import { ORG_ROLES, type OrgRole } from '@wizeworks/auth/org-roles';
import { productCopy } from '../../lib/product';

/** The role names as a person reads them. */
const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  builder: 'Website',
  marketing: 'Marketing',
  support: 'Support',
  partner: 'Partners',
  scanner: 'Warehouse',
  viewer: 'View only',
};

/**
 * One sentence per role, in plain language, always naming a limit.
 *
 * Written to be read by someone who has never administered software before, so:
 * no "permissions", no "scopes", no "PII", no "read-only access to the
 * resource". Just what this person will and will not be able to do.
 */
const ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner:
    'Runs the whole account, including billing and closing it down. There is only one owner and it cannot be changed here.',
  admin:
    'Can do everything day to day, including inviting people and deciding what each of them can reach. Cannot touch billing or close the account.',
  editor:
    'Does the everyday work — products, content, orders and customers. Cannot invite people or change what anyone is allowed to see.',
  builder:
    'Works on your website: pages, layout and how it all looks. Cannot see orders, customers or anything to do with money.',
  marketing:
    'Writes content, sends email and sees how it performed. Cannot open orders or see customer contact details.',
  support:
    'Looks after customers — finds their orders, answers their questions and makes small fixes. Cannot change your products or your prices.',
  partner:
    'Runs your partner and referral program: who sends you business and what they are owed. Can only look, not change, everywhere else.',
  scanner:
    'Works the stock: receives deliveries, counts shelves, moves things between locations and looks items up. Cannot see what anything cost you, change a price, or adjust a quantity outside a count.',
  viewer:
    'Can look at everything you have switched on and change none of it. A safe choice for an accountant or an adviser.',
};

export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}

export function roleDescription(role: string): string {
  return (
    (ROLE_DESCRIPTIONS as Record<string, string>)[role] ??
    productCopy(
      'team.roles.unknown',
      'A role this version of Piggles does not recognize. It still works — ask us what it covers.'
    )
  );
}

/**
 * The roles that can be HANDED to someone.
 *
 * Owner is missing and always will be: the account has exactly one, it belongs
 * to whoever created it, and the server refuses to assign it. Offering it in a
 * picker would be offering an error.
 */
export const ASSIGNABLE_ROLES: readonly OrgRole[] = ORG_ROLES.filter((role) => role !== 'owner');

/* ── The server's rules, mirrored ───────────────────────────────────────────
   Each of these is enforced in api-rest and repeated here for ONE reason: so
   the interface never puts a control in front of someone that will come back
   refused. They are not a security boundary and must never be treated as one —
   a hand-rolled request bypasses every function below and gets nowhere. */

/** Only owners and admins may change anything about the team. Everyone else
 *  sees the roster — knowing who your colleagues are is not privileged — and
 *  no controls at all. */
export function canManageTeam(viewerRole: string | undefined): boolean {
  return viewerRole === 'owner' || viewerRole === 'admin';
}

/**
 * Whether a specific person can be edited or removed by this viewer.
 *
 * Two refusals, both of which exist to stop an account locking itself out:
 * the owner is untouchable, and nobody can demote or remove THEMSELVES. The
 * second one catches the honest mistake — an admin tidying the list and
 * clicking their own row.
 */
export function canModifyMember(
  viewerRole: string | undefined,
  viewerUserId: string | undefined,
  member: { role: string; userId: string }
): boolean {
  if (!canManageTeam(viewerRole)) return false;
  if (member.role === 'owner') return false;
  return member.userId !== viewerUserId;
}

/**
 * Whether limiting someone to chosen areas means anything for this role.
 *
 * It does not for owners and admins: both are defined by reaching everything,
 * so a list of ticked areas beside them would be a control that changes
 * nothing. The server ignores module access for these two; the UI hides it and
 * says why in a sentence instead.
 */
export function roleHasModuleLimits(role: string): boolean {
  return role !== 'owner' && role !== 'admin';
}

/** Name, falling back to the email — a person who signed up without filling in
 *  a name is still a person, and "—" in the name column helps nobody. */
export function personName(person: { name?: string | null; email: string }): string {
  const trimmed = person.name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : person.email;
}

/** Two letters for the avatar chip. Falls back through the email so there is
 *  always something rather than an empty circle. */
export function personInitials(person: { name?: string | null; email: string }): string {
  const source = personName(person);
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}
