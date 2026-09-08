'use client';

// HOW YOUR STOCK IS VALUED — the one setting behind every money figure.
//
// ── Why this deserves a screen of its own ────────────────────────────────
//
// The same shelf of goods is worth different amounts under different methods,
// and which one a business uses is a decision it makes with its accountant, not
// a preference. Burying it in a settings list next to "default page size" would
// say the opposite. So each choice is explained by what it is FOR, in the words
// a business owner would use, and the screen says plainly what changing it does
// and does not do.
//
// ── Changing it never rewrites history ───────────────────────────────────
//
// Movements already stamped with a cost keep it. That is stated on the screen
// rather than only in the code, because "will this change last year's accounts"
// is the first question anyone sensible asks before touching a control like this,
// and a setting that cannot answer it is a setting nobody dares use.
//
// ── Not a list, not a detail — a form ────────────────────────────────────
//
// One record, three decisions, an explicit Save. Same shape as every other
// editor in the workbench: last write wins, no autosave, and the leave-guard
// registers so closing the pane with unsaved changes asks first.

import { useEffect, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  RadioGroup,
  RadioOption,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Save, Scale } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { buyingErrorMessage } from './suppliers-data';
import {
  ALLOCATION_BASES,
  COSTING_METHODS,
  methodLabel,
  useCostingPolicy,
  useSaveCostingPolicy,
  type AllocationBasis,
  type CostingMethod,
} from './costing-data';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

interface Form {
  method: CostingMethod;
  defaultAllocationBasis: AllocationBasis;
  baseCurrency: string;
}

export function CostingSettingsSurface({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const policy = useCostingPolicy();
  const savePolicy = useSaveCostingPolicy();

  const [form, setForm] = useState<Form | null>(null);
  const [baseline, setBaseline] = useState('');

  useEffect(() => {
    ctx.setTitle('How stock is valued');
  }, [ctx]);

  // Seed once the record lands. Re-seeding on every refetch would throw away
  // whatever the user was in the middle of choosing.
  useEffect(() => {
    if (!policy.data || form !== null) return;
    const next: Form = {
      method: policy.data.method,
      defaultAllocationBasis: policy.data.defaultAllocationBasis,
      baseCurrency: policy.data.baseCurrency,
    };
    setForm(next);
    setBaseline(JSON.stringify(next));
  }, [policy.data, form]);

  const dirty = form !== null && JSON.stringify(form) !== baseline;
  useDirtySource(dirty, 'You have not saved how your stock is valued. Close anyway?');

  const methodChanged =
    form !== null && policy.data !== undefined && form.method !== policy.data.method;

  const save = () => {
    if (!form) return;
    savePolicy.mutate(
      {
        method: form.method,
        defaultAllocationBasis: form.defaultAllocationBasis,
        baseCurrency: form.baseCurrency.trim().toUpperCase(),
      },
      {
        onSuccess: (saved) => {
          const next: Form = {
            method: saved.method,
            defaultAllocationBasis: saved.defaultAllocationBasis,
            baseCurrency: saved.baseCurrency,
          };
          setForm(next);
          setBaseline(JSON.stringify(next));
          toast.add({
            title: 'Saved',
            description: `Stock is now valued using ${methodLabel(saved.method).toLowerCase()}. Everything already recorded keeps the cost it was recorded at.`,
            type: 'success',
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save that',
            description: buyingErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const body = () => {
    if (policy.isError) {
      return (
        <Alert color="danger" variant="soft" className="m-4">
          <AlertContent>
            <AlertTitle>Could not load this setting</AlertTitle>
            <AlertDescription>
              This is a problem reaching the server. How your stock is valued is unaffected.
            </AlertDescription>
          </AlertContent>
        </Alert>
      );
    }
    if (!form) {
      return (
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      );
    }

    return (
      <div className={COLUMN}>
        <div className="flex flex-col gap-1">
          <Heading level={1} className="text-2xl font-semibold">
            How your stock is valued
          </Heading>
          <Text>
            The one setting behind every money figure you see about stock — what it is worth, what
            your goods cost you, and what your margin actually is.
          </Text>
        </div>

        {policy.data && !policy.data.configured ? (
          <Alert color="info">
            <AlertContent>
              <AlertTitle>You are on the standard setting</AlertTitle>
              <AlertDescription>
                Nobody has chosen here yet, so your stock is valued at average cost — which is the
                right answer for most businesses. Change it only if your accountant has asked you
                to.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <FormSection
          title="What a unit is worth when it sells"
          description="When you sell something, this decides which cost comes off your margin."
        >
          <RadioGroup
            color="module"
            value={form.method}
            onValueChange={(value) => {
              setForm({ ...form, method: value as CostingMethod });
            }}
          >
            {COSTING_METHODS.map((option) => (
              <RadioOption key={option.value} value={option.value} className="items-start py-1">
                <span className="flex flex-col gap-0.5">
                  <span className="text-base font-medium">{option.label}</span>
                  <span className="text-sm">{option.hint}</span>
                </span>
              </RadioOption>
            ))}
          </RadioGroup>
        </FormSection>

        {/* The question anyone sensible asks before touching this. Answered on
            the screen, at the moment they change it, not in a help article. */}
        {methodChanged ? (
          <Alert color="warning">
            <AlertContent>
              <AlertTitle>This changes what happens next, not what already happened</AlertTitle>
              <AlertDescription>
                Everything you have already sold keeps the cost it was sold at, and last year&apos;s
                figures do not move. From the moment you save, new sales are costed the new way.
              </AlertDescription>
            </AlertContent>
          </Alert>
        ) : null}

        <FormSection
          title="Spreading shipping and duty"
          description="When you record what it cost to get a delivery here, this is how it gets divided across the things that arrived. You can change it on any individual cost."
        >
          <Field>
            <FieldLabel>Usually spread by</FieldLabel>
            <RadioGroup
              color="module"
              value={form.defaultAllocationBasis}
              onValueChange={(value) => {
                setForm({ ...form, defaultAllocationBasis: value as AllocationBasis });
              }}
            >
              {ALLOCATION_BASES.filter((b) => b.value !== 'manual').map((option) => (
                <RadioOption key={option.value} value={option.value} className="items-start py-1">
                  <span className="flex flex-col gap-0.5">
                    <span className="text-base font-medium">{option.label}</span>
                    <span className="text-sm">{option.hint}</span>
                  </span>
                </RadioOption>
              ))}
            </RadioGroup>
          </Field>
        </FormSection>

        <FormSection
          title="The currency your books are kept in"
          description="Buying in another currency is converted into this one at the rate on the day the goods land, so your stock is worth one number however many currencies you buy in."
        >
          <Field>
            <FieldLabel>Currency</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  maxLength={3}
                  spellCheck={false}
                  className="w-28 uppercase"
                  aria-label="The currency your books are kept in"
                  value={form.baseCurrency}
                  onChange={(event) => {
                    setForm({ ...form, baseCurrency: event.target.value.toUpperCase() });
                  }}
                />
              }
            />
            <FieldDescription>
              A three-letter code — USD, GBP, EUR. Deliveries already booked keep the rate they were
              converted at.
            </FieldDescription>
          </Field>
        </FormSection>

        <FormSection title="What this does not change">
          <Text className="text-sm">
            <span className="font-medium">Your stock counts.</span> Nothing here moves a single
            unit. It changes what those units are worth, never how many of them you have.
          </Text>
          <Text className="text-sm">
            <span className="font-medium">Your selling prices.</span> These are cost settings. What
            you charge is set on your products and your price lists.
          </Text>
          <Text className="text-sm">
            <span className="font-medium">What you have already sold.</span> Every sale recorded the
            cost of its goods at the time. That figure is history and stays put.
          </Text>
        </FormSection>
      </div>
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Stock valuation actions"
        status={
          <span className="inline-flex items-center gap-1.5">
            <Scale className="size-4" aria-hidden />
            <Text as="span" className="text-sm font-medium">
              How stock is valued
            </Text>
          </span>
        }
        primary={
          <Button
            size="sm"
            color="module"
            className="ml-auto shrink-0"
            disabled={!dirty}
            loading={savePolicy.isPending}
            onClick={save}
          >
            <Save className="size-4" aria-hidden />
            Save
          </Button>
        }
        controls={
          <>
            {policy.data ? (
              <Badge color={policy.data.configured ? 'module' : 'neutral'} variant="soft" size="sm">
                {methodLabel(policy.data.method)}
              </Badge>
            ) : null}
          </>
        }
        refresh={
          <RefreshButton
            isFetching={policy.isFetching}
            updatedAt={policy.dataUpdatedAt}
            onRefresh={() => {
              void policy.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </div>
  );
}
