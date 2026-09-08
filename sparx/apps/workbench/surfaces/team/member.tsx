'use client';

// One teammate — everything about one person's access, in one pane.
//
// This is the surface the roster opens, and it is deliberately NOT a modal over
// the list. A modal would mean you can look at one colleague at a time, with the
// roster greyed out behind them, and the question people actually have is
// comparative: "does Sarah have the same reach as Tom?". As a pane, two of these
// open side by side and the answer is just visible. That is why this registers
// with `singleton: false` — a second copy is a feature, not a mistake.
//
// The screen answers three questions in the order people ask them: who is this,
// what are they allowed to do, and what have they been doing. Role and module
// access are ONE explicit save, because they are one decision — someone moving a
// person from Editor to Support usually adjusts their areas in the same breath,
// and two Save buttons would make that two acts that can half-fail.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertActions,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Avatar,
  Badge,
  Button,
  CheckboxGroup,
  CheckboxOption,
  EmptyState,
  Heading,
  MetadataItem,
  MetadataList,
  RadioGroup,
  RadioOption,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Activity, Save, TriangleAlert, UserX } from 'lucide-react';
import { EditorLayout, EDITOR_RAIL_STICKY } from '../../components/editor-layout';
import { FormSection } from '../../components/form-section';
import { describeAgo, useActivity } from '../../lib/api/activity';
import { useModuleStates, useViewer } from '../../lib/api/shell-data';
import { useTeamMember, useUpdateTeamMember, type MemberPatch } from '../../lib/api/team';
import { useDirtySource } from '../../lib/workbench/dirty';
import { moduleLabel } from '../../lib/surfaces/nav';
import {
  ModuleScope,
  WORKBENCH_MODULES,
  type WorkbenchModule,
} from '../../components/module-scope';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import {
  ASSIGNABLE_ROLES,
  canModifyMember,
  personInitials,
  personName,
  roleDescription,
  roleHasModuleLimits,
  roleLabel,
} from './roles';

/** An absolute date, spelled out. Deliberately not "3 months ago" for the
 *  joining date: "joined 12 March 2026" is a fact someone may need to quote,
 *  and a relative phrase makes them do arithmetic to get it back. */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

/** For "last seen" the opposite is true — nobody cares about the exact minute,
 *  they care whether it was today or in April. */
function formatSeen(iso: string | null, never: string): string {
  if (!iso) return never;
  return `${describeAgo(iso)} · ${formatDate(iso)}`;
}

function asModule(slug: string): WorkbenchModule | null {
  return (WORKBENCH_MODULES as readonly string[]).includes(slug) ? (slug as WorkbenchModule) : null;
}

/** The editable half of a member, which is exactly what PATCH accepts. */
interface AccessForm {
  role: string;
  moduleAccessMode: 'all' | 'selected';
  modules: string[];
}

export function TeamMemberSurface({ ctx }: { ctx: SurfaceContext }) {
  const memberId = ctx.params.memberId ?? '';
  const toast = useToast();

  const { member, ready, isError, missing, refetch } = useTeamMember(memberId);
  const { data: viewer } = useViewer();
  const { data: moduleStates } = useModuleStates();
  const update = useUpdateTeamMember();

  const [form, setForm] = useState<AccessForm>({
    role: 'viewer',
    moduleAccessMode: 'all',
    modules: [],
  });
  const [loaded, setLoaded] = useState(false);

  // Seeded once. A background refetch landing mid-edit must not overwrite the
  // role someone has picked but not saved.
  useEffect(() => {
    if (member && !loaded) {
      setForm({
        role: member.role,
        moduleAccessMode: member.moduleAccessMode,
        modules: member.modules,
      });
      setLoaded(true);
    }
  }, [member, loaded]);

  // The tab says the person's name the moment it is known. Until then it keeps
  // the registry's generic title rather than flashing an id at anyone.
  useEffect(() => {
    if (member) ctx.setTitle(personName(member));
  }, [ctx, member]);

  /** Only the areas this account actually has switched on. Offering a tick box
   *  for a module the tenant does not use would be offering a choice that
   *  changes nothing — and quietly implying they have a feature they do not. */
  const availableModules = useMemo(
    () => (moduleStates ?? []).filter((state) => state.enabled).map((state) => state.slug),
    [moduleStates]
  );

  const editable = member
    ? canModifyMember(viewer?.role, viewer?.userId, {
        role: member.role,
        userId: member.userId,
      })
    : false;

  const dirty =
    loaded &&
    member !== null &&
    (form.role !== member.role ||
      form.moduleAccessMode !== member.moduleAccessMode ||
      form.modules.join(',') !== member.modules.join(','));

  useDirtySource(dirty, "This teammate's access has unsaved changes. Close anyway?");

  if (isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <Alert color="error" className="max-w-md">
          <TriangleAlert />
          <AlertContent>
            <AlertTitle>Could not load this teammate</AlertTitle>
            <AlertDescription>
              Nothing about their access has changed — this is a problem reaching the server.
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

  if (!ready) {
    return (
      <p className="p-4" role="status">
        Loading…
      </p>
    );
  }

  // Loaded fine, but there is no such person. Almost always a pane left open
  // after someone was removed, so it is not framed as a failure.
  if (missing || !member) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <EmptyState
          icon={<UserX className="size-6" aria-hidden />}
          title="This person is no longer on your team"
          description="They may have been removed since you opened this. You can close this panel — everything else in your workspace is unaffected."
          actions={
            <Button
              color="neutral"
              variant="outline"
              size="sm"
              onClick={() => {
                ctx.close();
              }}
            >
              Close this panel
            </Button>
          }
        />
      </div>
    );
  }

  const name = personName(member);
  const isOwner = member.role === 'owner';
  const isSelf = member.userId === viewer?.userId;
  // Keyed on the role being EDITED, not the saved one — switching someone from
  // Editor to Admin should collapse the areas question the moment it stops
  // meaning anything, not after a save.
  const limitable = roleHasModuleLimits(form.role);

  const save = () => {
    // Only what changed. A patch that always sends every field would let a role
    // change silently re-assert a module list the operator never looked at.
    const patch: MemberPatch = {};
    if (form.role !== member.role) patch.role = form.role;
    if (form.moduleAccessMode !== member.moduleAccessMode) {
      patch.moduleAccessMode = form.moduleAccessMode;
    }
    if (form.modules.join(',') !== member.modules.join(',')) patch.modules = form.modules;

    update.mutate(
      { memberId: member.id, patch },
      {
        onSuccess: () => {
          toast.add({
            title: `${name}'s access updated`,
            description: 'It applies the next time they load a page.',
            type: 'success',
          });
        },
        onError: () => {
          toast.add({
            title: `Could not update ${name}`,
            description: 'Nothing was changed. Try again in a moment.',
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      {/* The save bar exists only for someone who can actually save. For
          everyone else this pane is a read-only profile, and a permanently
          dead button at the top of it would say nothing useful. */}
      {editable ? (
        <PaneToolbar
          label="Teammate actions"
          primary={
            <Button color="module" size="sm" disabled={!dirty || update.isPending} onClick={save}>
              <Save className="size-4" aria-hidden />
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          }
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <EditorLayout
          banner={
            // Said at the top, once, in the person's own words — not as a
            // scatter of disabled controls the reader has to interpret.
            isOwner ? (
              <Alert color="info">
                <AlertContent>
                  <AlertTitle>This is the account owner</AlertTitle>
                  <AlertDescription>
                    The owner reaches everything and cannot be changed or removed by anyone,
                    including themselves. That is what guarantees somebody always has the keys.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : isSelf ? (
              <Alert color="info">
                <AlertContent>
                  <AlertTitle>This is you</AlertTitle>
                  <AlertDescription>
                    You cannot change your own role or remove yourself. Ask another owner or admin
                    if you need it changed — it is the rule that stops an account being locked out
                    by accident.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : null
          }
          main={
            <>
              <FormSection
                title="What they are allowed to do"
                description="Their role decides what they see when they sign in. Pick the one that matches the job."
              >
                {editable ? (
                  <RadioGroup
                    color="module"
                    value={form.role}
                    aria-label={`Role for ${name}`}
                    onValueChange={(next) => {
                      setForm((prev) => ({ ...prev, role: next }));
                    }}
                  >
                    {ASSIGNABLE_ROLES.map((assignable) => (
                      <RadioOption key={assignable} value={assignable} className="items-start py-1">
                        <span className="flex flex-col gap-0.5">
                          <span className="font-medium">{roleLabel(assignable)}</span>
                          {/* The sentence is the control. Someone choosing
                              between Editor and Support is choosing between two
                              descriptions, not two words. */}
                          <span className="text-sm">{roleDescription(assignable)}</span>
                        </span>
                      </RadioOption>
                    ))}
                  </RadioGroup>
                ) : (
                  <div className="flex flex-col gap-1">
                    <Text className="font-medium">{roleLabel(member.role)}</Text>
                    <Text className="text-sm">{roleDescription(member.role)}</Text>
                  </div>
                )}
              </FormSection>

              {!limitable ? (
                <FormSection title="Which parts of sparx they can open">
                  <Text>
                    {isOwner ? 'Owners' : 'Admins'} always reach every part of sparx you have
                    switched on, so there is nothing to choose here.
                  </Text>
                </FormSection>
              ) : (
                <FormSection
                  title="Which parts of sparx they can open"
                  description="On top of their role, you can narrow someone down to just the areas they need."
                >
                  <RadioGroup
                    color="module"
                    value={form.moduleAccessMode}
                    aria-label={`Which areas ${name} can open`}
                    disabled={!editable}
                    onValueChange={(next) => {
                      setForm((prev) => ({
                        ...prev,
                        moduleAccessMode: next === 'selected' ? 'selected' : 'all',
                      }));
                    }}
                  >
                    <RadioOption value="all" className="items-start py-1">
                      <span className="flex flex-col gap-0.5">
                        <span className="font-medium">Everything their role allows</span>
                        <span className="text-sm">
                          They can open every area you have switched on, doing only what the role
                          above permits. This is the normal choice.
                        </span>
                      </span>
                    </RadioOption>
                    <RadioOption value="selected" className="items-start py-1">
                      <span className="flex flex-col gap-0.5">
                        <span className="font-medium">Only the areas I choose</span>
                        <span className="text-sm">
                          Everything else disappears for them entirely — not greyed out, simply not
                          there.
                        </span>
                      </span>
                    </RadioOption>
                  </RadioGroup>

                  {form.moduleAccessMode === 'selected' ? (
                    availableModules.length === 0 ? (
                      <Text>
                        You have not switched on any parts of sparx yet, so there is nothing to
                        choose between. Turn a module on and it will appear here.
                      </Text>
                    ) : (
                      <>
                        <CheckboxGroup
                          color="module"
                          value={form.modules}
                          aria-label={`Areas ${name} can open`}
                          disabled={!editable}
                          onValueChange={(next) => {
                            setForm((prev) => ({ ...prev, modules: next }));
                          }}
                          className="grid gap-1 @lg:grid-cols-2"
                        >
                          {availableModules.map((slug) => {
                            const module = asModule(slug);
                            return (
                              <CheckboxOption key={slug} value={slug}>
                                {module ? moduleLabel(module) : slug}
                              </CheckboxOption>
                            );
                          })}
                        </CheckboxGroup>
                        {/* An empty tick list is a real, saveable state that
                            leaves someone able to sign in and see nothing —
                            worth saying out loud before they save it. */}
                        {form.modules.length === 0 ? (
                          <Text className="text-warning">
                            Nothing is ticked, so {name} will be able to sign in and see nothing at
                            all.
                          </Text>
                        ) : null}
                      </>
                    )
                  ) : null}
                </FormSection>
              )}

              <MemberActivity userId={member.userId} name={name} />
            </>
          }
          rail={
            // The rail pins while the main column scrolls — the person's
            // identity is what every decision below is being made ABOUT, so it
            // should not scroll away from the role list.
            <div className={EDITOR_RAIL_STICKY}>
              <FormSection title="Who they are">
                <div className="flex items-center gap-3">
                  <Avatar size="md" color="neutral" alt={name}>
                    {personInitials(member)}
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <Heading level={3} className="truncate font-medium">
                      {name}
                    </Heading>
                    {name === member.email ? null : (
                      <span className="truncate text-sm">{member.email}</span>
                    )}
                  </div>
                </div>

                <MetadataList>
                  <MetadataItem label="Role">
                    <Badge color={isOwner ? 'primary' : 'neutral'} variant="soft" size="sm">
                      {roleLabel(member.role)}
                    </Badge>
                  </MetadataItem>
                  <MetadataItem label="Joined">{formatDate(member.createdAt)}</MetadataItem>
                  <MetadataItem label="Last signed in">
                    {formatSeen(member.lastLoginAt, 'Has not signed in yet')}
                  </MetadataItem>
                  <MetadataItem label="Last did something">
                    {formatSeen(member.lastActiveAt, 'Nothing yet')}
                  </MetadataItem>
                </MetadataList>
              </FormSection>
            </div>
          }
        />
      </div>
    </div>
  );
}

/**
 * What this person has actually been doing.
 *
 * The same audit log the Pulse feed reads, narrowed to one actor — which is the
 * question a roster raises and a role list cannot answer: not "what is Tom
 * allowed to do" but "what has Tom done". It is also the honest way to review
 * access, since a role nobody exercises is a role nobody needs.
 *
 * One window, no paging. This is context beside a profile, not the audit
 * surface — someone who wants the full trail wants Pulse, which pages properly.
 */
function MemberActivity({ userId, name }: { userId: string; name: string }) {
  const { items, ready } = useActivity({ actorId: userId, limit: 25 });

  return (
    <FormSection
      title="What they have been doing"
      description="Their most recent actions in this account, newest first."
    >
      {!ready ? (
        <Text role="status">Loading…</Text>
      ) : items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Activity className="size-6" aria-hidden />}
          title="Nothing yet"
          description={`${name} has not made any changes in this account so far. As soon as they do, it will be listed here.`}
        />
      ) : (
        <ul className="divide-base-300 flex flex-col divide-y">
          {items.map((item) => {
            const module = item.module === null ? null : asModule(item.module);
            const row = (
              <div className="flex items-baseline justify-between gap-3 py-2">
                <span className="flex min-w-0 items-baseline gap-2">
                  {/* The module's own hue on the dot — color follows
                      functionality, so a selling action reads orange inside
                      this platform-hued pane. */}
                  <span
                    className={`size-1.5 shrink-0 rounded-full ${module ? 'bg-module' : 'bg-base-300'}`}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">
                    {item.title}
                    {item.subject ? ` — ${item.subject}` : ''}
                  </span>
                </span>
                <Text className="shrink-0 text-sm">{describeAgo(item.at)}</Text>
              </div>
            );
            return (
              <li key={item.id}>
                {module ? <ModuleScope module={module}>{row}</ModuleScope> : row}
              </li>
            );
          })}
        </ul>
      )}
    </FormSection>
  );
}
