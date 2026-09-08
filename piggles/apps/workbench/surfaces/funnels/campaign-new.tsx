'use client';

// Starting a campaign: a name and what kind of thing it is, and nothing else.
//
// The kind picks the starting ladder. Everything else is easier to decide once
// there is a campaign on screen to decide it about.

import { shownInPlace } from '@wizeworks/query';
import { useState } from 'react';
import {
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  Select,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { PANE_SHELL } from '../../components/pane-toolbar';
import { useActivePropertyId } from '../../lib/api/shell-data';
import { useDirtySource } from '../../lib/workbench/dirty';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { funnelErrorMessage, useCreateFunnel } from './data';
import { KIND_BLURB, KIND_LABEL } from './presentation';
import type { FunnelKind } from './types';

const KIND_ITEMS = (Object.keys(KIND_LABEL) as FunnelKind[]).map((k) => ({
  value: k,
  label: KIND_LABEL[k],
}));

export function NewCampaign({ ctx }: { ctx: SurfaceContext }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FunnelKind>('lead');
  const create = useCreateFunnel();
  // The RESOLVED site, not the raw cookie value — see useActivePropertyId. This
  // read the token directly, which is null for anybody who has never opened the
  // site switcher, and left "Create it" permanently disabled for them.
  const siteId = useActivePropertyId();
  const toast = useToast();

  useDirtySource(
    name.trim().length > 0 && !create.isSuccess,
    'This campaign has not been saved yet. Close anyway?'
  );

  const submit = () => {
    if (!siteId || !name.trim()) return;
    create.mutate(
      { propertyId: siteId, name: name.trim(), kind },
      {
        onSuccess: (funnel) => {
          toast.add({ title: `${funnel.name} created`, type: 'success' });
          // Replaces this pane: what was being created and what is now being
          // edited are one campaign.
          ctx.open('funnels.campaign', { id: funnel.id }, { target: 'replace' });
        },
        onError: shownInPlace,
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
          <Heading level={2} className="text-lg font-semibold">
            Start a campaign
          </Heading>

          <Field>
            <FieldLabel>What is it called?</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  placeholder="Spring service promotion"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                  }}
                />
              }
            />
          </Field>

          <Field>
            <FieldLabel>What is it for?</FieldLabel>
            <FieldControl
              render={
                <Select
                  color="module"
                  value={kind}
                  onValueChange={(value) => {
                    setKind(value as FunnelKind);
                  }}
                  items={KIND_ITEMS}
                />
              }
            />
            <FieldDescription>{KIND_BLURB[kind]}</FieldDescription>
          </Field>

          {create.isError ? (
            <Text className="text-danger text-sm">
              {funnelErrorMessage(create.error, 'That campaign could not be created.')}
            </Text>
          ) : null}

          <div>
            <Button
              color="module"
              disabled={!name.trim() || !siteId || create.isPending}
              onClick={submit}
            >
              Create it
            </Button>
          </div>
          <Text className="text-sm">
            It starts as a draft and counts nobody until you turn it on.
          </Text>
        </div>
      </div>
    </div>
  );
}
