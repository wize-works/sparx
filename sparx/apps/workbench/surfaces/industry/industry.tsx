'use client';

// Industry — tell sparx what line of work you are in, and it changes the wording
// and the starting setup to match.
//
// A singleton settings PANE, not a modal: it is durable and reached from the
// nav, and choosing an industry is a real, consequential action you return to.
// One centred column of selectable cards — this is a choice with an explanation,
// not a form with a summary rail.
//
// Applying an industry does two things the copy has to be honest about: it
// records your industry (which retunes wording across sparx), and it stamps a
// tailored starting setup into the parts of sparx you have switched on. That
// second part is ADDITIVE — it fills empty slots and never touches anything you
// have already made — and the confirm says so in plain words before anything
// happens.
//
// Industry-agnostic by construction: the list comes from the server and spans
// retail, food, services, and wholesale. No vertical is foregrounded.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  CardBody,
  CardTitle,
  Heading,
  SelectableCard,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Check, Compass } from 'lucide-react';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import { ModuleScope } from '../../components/module-scope';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  iconForStarter,
  moduleHue,
  moduleLabel,
  useApplyIndustry,
  useIndustryStarters,
  type IndustryStarter,
} from './data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/** A soft, module-tinted chip naming one part of sparx a starter sets up. */
function ModuleChip({ slug }: { slug: string }) {
  return (
    <ModuleScope module={moduleHue(slug)} className="inline-flex">
      <Badge color="module" variant="soft" size="sm">
        {moduleLabel(slug)}
      </Badge>
    </ModuleScope>
  );
}

function StarterCard({
  starter,
  selected,
  onSelect,
}: {
  starter: IndustryStarter;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = iconForStarter(starter.iconKey);
  return (
    <SelectableCard
      name="industry"
      value={starter.slug}
      checked={selected}
      onChange={onSelect}
      className="h-full"
    >
      <CardBody className="gap-4">
        <div className="flex items-start gap-3">
          <span className="bg-base-200 flex size-11 shrink-0 items-center justify-center rounded-lg">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{starter.name}</CardTitle>
              {starter.active ? (
                <Badge color="success" variant="soft" size="sm">
                  Current
                </Badge>
              ) : null}
            </div>
            <Text>{starter.description}</Text>
          </div>
        </div>
        {starter.enabledModules.length > 0 ? (
          <div className="mt-auto flex flex-wrap gap-1.5">
            {starter.enabledModules.map((slug) => (
              <ModuleChip key={slug} slug={slug} />
            ))}
          </div>
        ) : null}
      </CardBody>
    </SelectableCard>
  );
}

export function IndustrySurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } = useIndustryStarters();
  const apply = useApplyIndustry();

  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    ctx.setTitle('Industry');
  }, [ctx]);

  const activeSlug = useMemo(() => data?.find((s) => s.active)?.slug ?? null, [data]);

  // Seed the selection to whatever is already chosen, once. After that it is the
  // person's to move.
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (data && !seeded) {
      setSelected(activeSlug);
      setSeeded(true);
    }
  }, [data, seeded, activeSlug]);

  // Picking a different card but not yet applying is unsaved intent worth
  // guarding — closing the pane would drop the choice silently.
  const dirty = seeded && selected !== null && selected !== activeSlug;
  useDirtySource(dirty, 'You picked an industry but have not applied it yet. Close anyway?');

  if (isError) {
    return (
      <PaneLoadError
        title="Could not load the industry list"
        description="This is a problem reaching the server. Your current industry is unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const chosen = data?.find((s) => s.slug === selected) ?? null;
  const isReapply = chosen?.active ?? false;

  const offModules = chosen ? chosen.modules.filter((m) => !chosen.enabledModules.includes(m)) : [];

  const onApply = async () => {
    if (!chosen) return;
    const enabledList = chosen.enabledModules.map(moduleLabel).join(', ');
    const ok = await confirm({
      title: isReapply
        ? `Update the starting setup for ${chosen.name}?`
        : `Set your industry to ${chosen.name}?`,
      description: isReapply
        ? `This tops up the starting setup in the parts of sparx you have switched on${
            enabledList ? ` (${enabledList})` : ''
          }. It only fills empty spots — nothing you have already made is changed or removed.`
        : `This retunes the wording across sparx to match ${chosen.name}, and adds a tailored starting setup to the parts you have switched on${
            enabledList ? ` (${enabledList})` : ''
          }. It only fills empty spots — nothing you have already made is changed or removed.`,
      confirmLabel: isReapply ? 'Update setup' : 'Set my industry',
      cancelLabel: 'Not now',
      color: 'primary',
    });
    if (!ok) return;

    apply.mutate(chosen.slug, {
      onSuccess: (result) => {
        const added = result.installed.length;
        toast.add({
          title: `Industry set to ${chosen.name}`,
          description:
            added > 0
              ? `Added ${String(added)} ${added === 1 ? 'piece' : 'pieces'} of starting setup. Nothing you made was changed.`
              : 'Everything for this industry was already in place.',
          type: 'success',
        });
      },
      onError: () => {
        toast.add({
          title: 'Could not apply that industry',
          description: 'Nothing was changed. Try again in a moment.',
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Industry actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={!chosen || apply.isPending}
            loading={apply.isPending}
            onClick={() => {
              void onApply();
            }}
          >
            <Check className="size-4" aria-hidden />
            {isReapply ? 'Update setup' : 'Set my industry'}
          </Button>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isPending || !data ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : (
          <div className={COLUMN}>
            <div className="flex flex-col gap-1">
              <Heading level={1} className="text-2xl font-semibold">
                What line of work are you in?
              </Heading>
              <Text>
                Telling sparx your industry changes the wording you see and gives you a starting
                setup built for that trade — example categories, sensible defaults, and a bit of
                content to build on. You can change it later, and picking one never removes anything
                you have already made.
              </Text>
            </div>

            {data.length === 0 ? (
              <Alert color="info">
                <AlertContent>
                  <AlertTitle>No industries to choose from</AlertTitle>
                  <AlertDescription>
                    This list should not be empty. Try reloading in a moment.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            ) : (
              <>
                <div className="grid gap-3 @2xl:grid-cols-2">
                  {data.map((starter) => (
                    <StarterCard
                      key={starter.slug}
                      starter={starter}
                      selected={selected === starter.slug}
                      onSelect={() => {
                        setSelected(starter.slug);
                      }}
                    />
                  ))}
                </div>

                {chosen ? (
                  <FormSection
                    title={
                      isReapply
                        ? `${chosen.name} is your current industry`
                        : `What happens when you apply ${chosen.name}`
                    }
                  >
                    <Text>
                      {chosen.enabledModules.length > 0
                        ? `sparx will set up ${chosen.name.toLowerCase()} defaults across ${chosen.enabledModules
                            .map(moduleLabel)
                            .join(
                              ', '
                            )}. Everything it adds is new — your own work is left exactly as it is.`
                        : 'This only retunes the wording for now — you have no matching parts of sparx switched on yet, so there is nothing to set up until you do.'}
                    </Text>
                    {offModules.length > 0 ? (
                      <Text>
                        It also has a setup ready for {offModules.map(moduleLabel).join(', ')} —
                        that part waits quietly until you switch{' '}
                        {offModules.length === 1 ? 'it' : 'them'} on.
                      </Text>
                    ) : null}
                  </FormSection>
                ) : (
                  <FormSection title="Pick one to see what it sets up">
                    <Text>
                      Choose the closest match above. Nothing changes until you press the button in
                      the bar — you can look before you commit.
                    </Text>
                  </FormSection>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Sits on the pane, not in a docked strip. */}
      <p className="shrink-0 px-1 text-sm">
        <Compass className="mr-1 inline size-4 align-[-3px]" aria-hidden />
        Not sure? Pick the closest — you can change your industry whenever you like.
      </p>
    </div>
  );
}
