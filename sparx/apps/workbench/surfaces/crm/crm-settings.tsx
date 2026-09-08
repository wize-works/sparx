'use client';

// How the CRM behaves — the three decisions a business makes ABOUT its records
// rather than in them (docs/144 §11 + §12).
//
// ONE SCREEN, THREE SWITCHES, and they are here together because each one is a
// choice that quietly changes data rather than throwing an error when it is
// wrong. Offering a company by email domain, deciding what counts as the same
// person, and deciding whether the platform may ever merge two records without
// anybody looking — get any of them wrong and nothing breaks, it just slowly
// stops being true.
//
// THE AUTO-MERGE SWITCH IS THE ONE THAT MATTERS. It is the only control in the
// CRM that lets the platform destroy a record unattended, so it is off by
// default, it is stated in the words of what it will actually do, and the
// weakest match rule sits below every threshold it will accept — a surname and
// an employer can never merge two colleagues on its own no matter what is set
// here.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Checkbox,
  Field,
  FieldDescription,
  FieldLabel,
  Heading,
  Select,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { SlidersHorizontal } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import {
  MATCH_RULES,
  useCrmSettings,
  useUpdateCrmSettings,
  workspaceErrorMessage,
  type CrmSettings,
  type DuplicateMatchRule,
} from './workspace-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/** The thresholds offered, in the words of what each one will actually merge.
 *  A free number box here would let somebody type 51 and merge guesses. */
const THRESHOLDS: { value: number | null; label: string; description: string }[] = [
  {
    value: null,
    label: 'Never — always ask me',
    description: 'Nothing is merged unless somebody looks at it first. Merging cannot be undone.',
  },
  {
    value: 100,
    label: 'Only when the email address is identical',
    description: 'Two records with one address are the same person. Nothing else is touched.',
  },
  {
    value: 90,
    label: 'Identical email, or the same phone number',
    description:
      'Adds shared phone numbers, which are nearly always one person — but a family or a shared office line would be merged too.',
  },
];

function sameRules(a: DuplicateMatchRule[], b: DuplicateMatchRule[]): boolean {
  return a.length === b.length && a.every((rule) => b.includes(rule));
}

export function CrmSettingsSurface({ ctx }: { ctx: SurfaceContext }) {
  const query = useCrmSettings();
  const save = useUpdateCrmSettings();
  const toast = useToast();

  const saved = query.data;
  const [draft, setDraft] = useState<CrmSettings | null>(null);

  useEffect(() => {
    if (saved && draft === null) setDraft(saved);
  }, [saved, draft]);

  useEffect(() => {
    ctx.setTitle('How the CRM behaves');
  }, [ctx]);

  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    return (
      draft.domainAssociation !== saved.domainAssociation ||
      draft.autoMergeThreshold !== saved.autoMergeThreshold ||
      !sameRules(draft.duplicateMatchRules, saved.duplicateMatchRules)
    );
  }, [draft, saved]);

  useDirtySource(dirty, 'Your changes to how the CRM behaves have not been saved. Close anyway?');

  const set = <K extends keyof CrmSettings>(key: K, value: CrmSettings[K]): void => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const toggleRule = (rule: DuplicateMatchRule): void => {
    setDraft((current) => {
      if (!current) return current;
      const on = current.duplicateMatchRules.includes(rule);
      // At least one rule has to stay on. With none, the duplicates screen finds
      // nothing and reads as broken rather than as switched off.
      if (on && current.duplicateMatchRules.length === 1) return current;
      return {
        ...current,
        duplicateMatchRules: on
          ? current.duplicateMatchRules.filter((r) => r !== rule)
          : [...current.duplicateMatchRules, rule],
      };
    });
  };

  const submit = (): void => {
    if (!draft) return;
    save.mutate(draft, {
      onSuccess: () => {
        toast.add({ title: 'Saved', type: 'success' });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not save',
          description: workspaceErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="CRM behaviour actions"
        status={
          <Text as="span" className="text-sm">
            These apply to the business you are working in.
          </Text>
        }
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            loading={save.isPending}
            disabled={!dirty}
            onClick={submit}
          >
            Save
          </Button>
        }
        controls={
          <>
            <SlidersHorizontal className="size-4 shrink-0" aria-hidden />
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          {query.isError ? (
            <Alert color="error">
              <AlertContent>
                <AlertTitle>Could not load your settings</AlertTitle>
                <AlertDescription>
                  {workspaceErrorMessage(query.error, 'Try again in a moment.')}
                </AlertDescription>
              </AlertContent>
            </Alert>
          ) : null}

          {draft ? (
            <>
              <FormSection
                title="Suggesting a company"
                description="What happens when somebody new is added with a work email address."
              >
                {/* The label and its description are Field parts, so they need a
                    Field root above them — outside one, Base UI throws and takes
                    the whole pane down with it. */}
                <Field>
                  <div className="flex items-start gap-3">
                    <Switch
                      color="module"
                      aria-label="Offer a company when the email domain matches one"
                      checked={draft.domainAssociation}
                      onCheckedChange={(checked) => {
                        set('domainAssociation', checked === true);
                      }}
                    />
                    <div className="flex flex-col gap-1">
                      <FieldLabel>Offer a company when the email domain matches one</FieldLabel>
                      <FieldDescription>
                        Add someone at <Text as="span">jo@northgatedental.com</Text> and we&rsquo;ll
                        ask whether they belong under Northgate Dental Group — if you have told us
                        that domain belongs to them. It is always a question, never done for you,
                        and personal addresses like gmail are ignored entirely.
                      </FieldDescription>
                    </div>
                  </div>
                </Field>
              </FormSection>

              <FormSection
                title="What counts as the same person"
                description="Used when looking for duplicates. Turn off anything that is not true of your customers."
              >
                <div className="flex flex-col gap-3">
                  {MATCH_RULES.map((rule) => {
                    const on = draft.duplicateMatchRules.includes(rule.value);
                    const onlyOne = on && draft.duplicateMatchRules.length === 1;
                    return (
                      <Card key={rule.value} className="p-3">
                        <Field className="flex items-start gap-3">
                          <Checkbox
                            color="module"
                            checked={on}
                            className="mt-0.5"
                            aria-label={rule.label}
                            onChange={() => {
                              // A no-op when it is the last one on. Handled in
                              // the setter rather than by disabling the control,
                              // because a disabled checkbox with no explanation
                              // reads as broken — the line below says why.
                              toggleRule(rule.value);
                            }}
                          />
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <FieldLabel>{rule.label}</FieldLabel>
                              <Badge
                                color={
                                  rule.confidence >= 100
                                    ? 'success'
                                    : rule.confidence >= 80
                                      ? 'info'
                                      : 'warning'
                                }
                                variant="soft"
                                size="sm"
                              >
                                {rule.confidence}% sure
                              </Badge>
                            </div>
                            <FieldDescription>{rule.description}</FieldDescription>
                            {onlyOne ? (
                              <FieldDescription>
                                Keep at least one on, or nothing will ever be found.
                              </FieldDescription>
                            ) : null}
                          </div>
                        </Field>
                      </Card>
                    );
                  })}
                </div>
              </FormSection>

              <FormSection
                title="Merging without asking"
                description="Merging moves one record's orders, spend and history onto another and retires it. It cannot be undone."
              >
                <Field>
                  <FieldLabel>Merge duplicates on their own when</FieldLabel>
                  <Select
                    color="module"
                    aria-label="When to merge duplicates automatically"
                    value={String(draft.autoMergeThreshold ?? 'never')}
                    items={Object.fromEntries(
                      THRESHOLDS.map((t) => [String(t.value ?? 'never'), t.label])
                    )}
                    onValueChange={(value) => {
                      set('autoMergeThreshold', value === 'never' ? null : Number(value));
                    }}
                  />
                  <FieldDescription>
                    {THRESHOLDS.find(
                      (t) =>
                        String(t.value ?? 'never') === String(draft.autoMergeThreshold ?? 'never')
                    )?.description ?? ''}
                  </FieldDescription>
                </Field>

                {draft.autoMergeThreshold !== null ? (
                  <Alert color="warning">
                    <AlertContent>
                      <AlertTitle>Records will be merged without you seeing them</AlertTitle>
                      <AlertDescription>
                        The most recently updated record survives and absorbs the others. Anything
                        it was missing gets filled in from them, so nothing is lost — but the merge
                        itself is permanent.
                      </AlertDescription>
                    </AlertContent>
                  </Alert>
                ) : null}
              </FormSection>
            </>
          ) : (
            <Heading level={2} className="text-lg">
              Loading&hellip;
            </Heading>
          )}
        </div>
      </div>
    </div>
  );
}
