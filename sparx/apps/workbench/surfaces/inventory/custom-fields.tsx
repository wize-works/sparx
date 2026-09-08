'use client';

// THE COLUMNS THAT ARE YOURS (docs/146 Phase 11.8).
//
// Every business keeps one or two facts about its stock that no product schema
// anticipates: the shelf a part lives on in the old numbering, the customer a
// batch is earmarked for, the certification a supplier holds, the project a
// purchase order is charged to. Today those live in a column of the spreadsheet
// sparx is asking them to give up — and "you'd lose that column" is a complete
// reason not to switch.
//
// ── What a field costs, and why removing is not deleting ─────────────────
//
// Adding a column changes every form and every export for everybody, so this is
// an admin screen rather than a preference. Removing one hides data on every
// record at once — so removing turns it OFF and leaves the values where they
// are. Turn it back on and everything anybody typed is still there. A settings
// screen that can destroy a morning's work gets avoided; one that cannot gets
// used.
//
// ── Why a key is frozen ──────────────────────────────────────────────────
//
// The key is what appears in the CSV header, in the API, and in the MCP tool.
// The label is what appears on screen. Renaming the label must not move the
// data, which is the entire reason the two are separate.

import { useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  EmptyState,
  Field,
  FieldLabel,
  Input,
  NativeSelect,
  Switch,
  Table,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { Columns3, Plus, Trash2 } from 'lucide-react';
import { FormSection } from '../../components/form-section';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { useConfirm } from '../../lib/confirm';
import { afterCommit } from '../../lib/defer';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { stockErrorMessage } from './data';
import {
  CUSTOM_FIELD_ENTITY_LABELS,
  CUSTOM_FIELD_ENTITY_NOUNS,
  CUSTOM_FIELD_TYPE_LABELS,
  useCreateCustomField,
  useCustomFields,
  useDeleteCustomField,
  useUpdateCustomField,
  type CustomField,
  type CustomFieldEntity,
  type CustomFieldType,
} from './onboarding-data';

const ENTITIES: CustomFieldEntity[] = ['variant', 'level', 'supplier', 'purchase_order'];
const TYPES: CustomFieldType[] = [
  'text',
  'number',
  'money',
  'date',
  'boolean',
  'select',
  'multi_select',
  'url',
];

/** What each record is, said once, where somebody choosing between them will
 *  read it. "Item" and "stock at a location" is the distinction people get wrong
 *  — an aisle number belongs to the location, a part number belongs to the item. */
const ENTITY_HELP: Record<CustomFieldEntity, string> = {
  variant: 'Facts about the thing itself, wherever it is kept — a part number, a material, a size.',
  level: 'Facts about stock at ONE place — the aisle, the shelf, who this pallet is earmarked for.',
  supplier: 'Facts about who you buy from — an account number, a certification, a rep.',
  purchase_order: 'Facts about an order — the project it is charged to, who asked for it.',
};

/** Which records carry their own columns into a LIST you can edit in bulk.
 *  Today that is stock at a location and nothing else: the stock grid reads
 *  `level` definitions, and so do the spreadsheet import and its template.
 *
 *  This is a switch, so it must not be offered where nothing would read it —
 *  a toggle that changes nothing is worse than an absent one, because the
 *  person turns it on, sees no column, and stops trusting the screen. Fields on
 *  the other records are still fully real: they show on the record itself, and
 *  they go out over the API and to a connected assistant. */
const HAS_EDITABLE_LIST: Record<CustomFieldEntity, boolean> = {
  variant: false,
  level: true,
  supplier: false,
  purchase_order: false,
};

/** Where a field on this record actually turns up, said plainly. The sentence
 *  is per record because the answer is: a `level` field reaches the grid and
 *  the spreadsheet, and the others do not. */
const ENTITY_REACH: Record<CustomFieldEntity, string> = {
  variant: 'on every item, over the API, and to any assistant connected to your account',
  level:
    'in the stock grid, in your spreadsheet exports as a cf_ column that imports back, over the API, and to any assistant connected to your account',
  supplier: 'on every supplier, over the API, and to any assistant connected to your account',
  purchase_order:
    'on every purchase order, over the API, and to any assistant connected to your account',
};

function NewFieldDialog({
  entity,
  open,
  onClose,
}: {
  entity: CustomFieldEntity;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const create = useCreateCustomField();
  const [label, setLabel] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [options, setOptions] = useState('');
  const [helpText, setHelpText] = useState('');
  const [required, setRequired] = useState(false);
  const [showInList, setShowInList] = useState(false);

  const isList = type === 'select' || type === 'multi_select';
  const choices = options
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const reset = (): void => {
    setLabel('');
    setType('text');
    setOptions('');
    setHelpText('');
    setRequired(false);
    setShowInList(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogTitle>A new column on every {CUSTOM_FIELD_ENTITY_NOUNS[entity]}</DialogTitle>
        <DialogDescription>{ENTITY_HELP[entity]}</DialogDescription>

        <div className="flex flex-col gap-3 py-2">
          <Field>
            <FieldLabel>What is it called</FieldLabel>
            <Input
              color="module"
              value={label}
              placeholder="Aisle"
              onChange={(event) => {
                setLabel(event.target.value);
              }}
            />
            <Text className="text-sm">
              You can rename this later. The short name it is stored under — the one that appears in
              your spreadsheet exports — is set from this now and then stays put.
            </Text>
          </Field>

          <Field>
            <FieldLabel>What kind of thing</FieldLabel>
            <NativeSelect
              color="module"
              value={type}
              onChange={(event) => {
                setType(event.target.value as CustomFieldType);
              }}
            >
              {TYPES.map((option) => (
                <option key={option} value={option}>
                  {CUSTOM_FIELD_TYPE_LABELS[option]}
                </option>
              ))}
            </NativeSelect>
            <Text className="text-sm">
              This is checked whenever anything is written — by hand, by an import, or by an
              assistant. A number field refuses text rather than quietly keeping it.
            </Text>
          </Field>

          {isList ? (
            <Field>
              <FieldLabel>The choices, one per line</FieldLabel>
              <Textarea
                color="module"
                rows={4}
                value={options}
                placeholder={'Aisle A\nAisle B\nMezzanine'}
                onChange={(event) => {
                  setOptions(event.target.value);
                }}
              />
            </Field>
          ) : null}

          <Field>
            <FieldLabel>A note for whoever fills it in</FieldLabel>
            <Input
              color="module"
              value={helpText}
              placeholder="Optional"
              onChange={(event) => {
                setHelpText(event.target.value);
              }}
            />
          </Field>

          <div className="flex items-center justify-between gap-3">
            <span className="flex flex-col">
              <Text className="font-medium">Must be filled in</Text>
              <Text className="text-sm">
                Only enforced on records somebody edits from now on, so nothing you already have
                becomes unsaveable.
              </Text>
            </span>
            <Switch
              color="module"
              aria-label="Must be filled in"
              checked={required}
              onCheckedChange={(next) => {
                setRequired(next === true);
              }}
            />
          </div>

          {HAS_EDITABLE_LIST[entity] ? (
            <div className="flex items-center justify-between gap-3">
              <span className="flex flex-col">
                <Text className="font-medium">Show it as a column in the stock grid</Text>
                <Text className="text-sm">
                  Off by default — twelve extra columns by surprise is nobody&rsquo;s idea of help.
                </Text>
              </span>
              <Switch
                color="module"
                aria-label="Show it as a column in the stock grid"
                checked={showInList}
                onCheckedChange={(next) => {
                  setShowInList(next === true);
                }}
              />
            </div>
          ) : null}

          <Text className="text-sm">Once you add it, it appears {ENTITY_REACH[entity]}.</Text>
        </div>

        <DialogFooter>
          <DialogClose>
            <Button color="neutral" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button
            color="module"
            disabled={label.trim() === '' || (isList && choices.length === 0) || create.isPending}
            onClick={() => {
              create.mutate(
                {
                  entity,
                  label: label.trim(),
                  type,
                  ...(isList ? { options: choices } : {}),
                  helpText: helpText.trim() === '' ? null : helpText.trim(),
                  required,
                  showInList,
                },
                {
                  onSuccess: (field) => {
                    reset();
                    onClose();
                    afterCommit(() => {
                      toast.add({
                        title: `${field.label} added`,
                        description: `It is stored as ${`cf_${field.key}`}, and appears ${ENTITY_REACH[entity]}.`,
                        type: 'success',
                      });
                    });
                  },
                  onError: (error) => {
                    afterCommit(() => {
                      toast.add({
                        title: 'Could not add it',
                        description: stockErrorMessage(error, 'Nothing was changed.'),
                        type: 'error',
                      });
                    });
                  },
                }
              );
            }}
          >
            Add the column
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldTable({ fields, entity }: { fields: CustomField[]; entity: CustomFieldEntity }) {
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdateCustomField();
  const remove = useDeleteCustomField();

  if (fields.length === 0) {
    return (
      <EmptyState
        icon={<Columns3 className="size-6" aria-hidden />}
        title="No columns of your own here yet"
        description={ENTITY_HELP[entity]}
      />
    );
  }

  return (
    <Table size="sm">
      <thead>
        <tr>
          <th>Column</th>
          <th>Kind</th>
          <th className="hidden @lg:table-cell">Stored as</th>
          {/* Only where a list reads it — see HAS_EDITABLE_LIST. */}
          {HAS_EDITABLE_LIST[entity] ? <th className="text-center">In the grid</th> : null}
          <th className="w-0" />
        </tr>
      </thead>
      <tbody>
        {fields.map((field) => (
          <tr key={field.id} className={field.isActive ? undefined : 'opacity-60'}>
            <td className="max-w-0">
              <span className="flex min-w-0 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{field.label}</span>
                  {field.required ? (
                    <Badge color="warning" variant="soft" size="sm">
                      Required
                    </Badge>
                  ) : null}
                  {field.isActive ? null : (
                    <Badge color="neutral" variant="outline" size="sm">
                      Turned off
                    </Badge>
                  )}
                </span>
                {field.helpText ? <span className="truncate text-sm">{field.helpText}</span> : null}
              </span>
            </td>
            <td className="whitespace-nowrap">
              <Badge color="module" variant="soft" size="sm">
                {CUSTOM_FIELD_TYPE_LABELS[field.type]}
              </Badge>
              {field.options.length > 0 ? (
                <Text className="text-sm">{field.options.join(', ')}</Text>
              ) : null}
            </td>
            <td className="hidden font-mono text-sm @lg:table-cell">cf_{field.key}</td>
            {HAS_EDITABLE_LIST[entity] ? (
              <td className="text-center">
                <Switch
                  color="module"
                  aria-label={`Show ${field.label} in the stock grid`}
                  checked={field.showInList}
                  onCheckedChange={(next) => {
                    update.mutate({ id: field.id, patch: { showInList: next === true } });
                  }}
                />
              </td>
            ) : null}
            <td className="text-right whitespace-nowrap">
              {field.isActive ? (
                <Button
                  color="danger"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: `Turn off ${field.label}?`,
                        description:
                          'It stops appearing on forms, in lists and in exports. Nothing anybody typed is deleted — turn it back on and every value is still there.',
                        confirmLabel: 'Turn it off',
                        cancelLabel: 'Keep it',
                        color: 'danger',
                      });
                      if (!ok) return;
                      remove.mutate(field.id, {
                        onSuccess: () => {
                          afterCommit(() => {
                            toast.add({
                              title: `${field.label} turned off`,
                              description: 'The values are still stored against each record.',
                              type: 'info',
                            });
                          });
                        },
                      });
                    })();
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Turn off
                </Button>
              ) : (
                <Button
                  color="success"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    update.mutate({ id: field.id, patch: { isActive: true } });
                  }}
                >
                  Turn back on
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export function InventoryCustomFieldsSurface(_props: { ctx: SurfaceContext }) {
  const [adding, setAdding] = useState<CustomFieldEntity | null>(null);
  const fields = useCustomFields(undefined, true);
  const all = fields.data?.items ?? [];

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Custom column controls"
        refresh={
          <RefreshButton
            isFetching={fields.isFetching}
            updatedAt={fields.data ? fields.dataUpdatedAt : undefined}
            onRefresh={() => {
              void fields.refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <Alert color="info">
            <AlertContent>
              <AlertDescription>
                Anything you add here appears on the record straight away, in the API, and to any
                assistant connected to your account. Columns on <strong>stock at a location</strong>{' '}
                go further: they are editable in the stock grid and ride your spreadsheet exports as
                a <span className="font-mono">cf_</span> column that imports back.
              </AlertDescription>
            </AlertContent>
          </Alert>

          {ENTITIES.map((entity) => (
            <FormSection
              key={entity}
              title={CUSTOM_FIELD_ENTITY_LABELS[entity]}
              description={ENTITY_HELP[entity]}
              action={
                <Button
                  color="module"
                  size="sm"
                  onClick={() => {
                    setAdding(entity);
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add a column
                </Button>
              }
            >
              <FieldTable fields={all.filter((field) => field.entity === entity)} entity={entity} />
            </FormSection>
          ))}
        </div>
      </div>

      {adding ? (
        <NewFieldDialog
          entity={adding}
          open
          onClose={() => {
            setAdding(null);
          }}
        />
      ) : null}
    </div>
  );
}
