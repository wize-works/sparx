'use client';

// One record type — its name, and the extra details this business tracks on it.
//
// `{ key: 'new' }` invents a record type; `{ key }` manages one. Same surface,
// because creating and editing are the same shape (sparx/apps/workbench/CLAUDE.md).
//
// THIS IS THE SURFACE THAT MAKES docs/144 §3 REAL. Everything else in the
// object registry — the validator, the segment source, the API, the MCP tools —
// is machinery a person never sees. This is where a business owner writes down
// that they track when a warranty expires, and it has to read like that: a list
// of details with names and kinds, not a schema editor.
//
// Explicit save, one button, last-write-wins — like every other editor in the
// platform. The draft lives here; nothing is written until Save.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Input,
  NativeSelect,
  Switch,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { Boxes, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { useConfirm } from '../../lib/confirm';
import { useDirtySource } from '../../lib/workbench/dirty';
import {
  ADVANCED_FIELD_TYPES,
  COMMON_FIELD_TYPES,
  FIELD_TYPE_HINTS,
  FIELD_TYPE_LABELS,
  keyFromLabel,
  objectTypeErrorMessage,
  useArchiveObjectType,
  useCreateObjectType,
  useObjectType,
  useUpdateObjectType,
  type PropertyField,
  type PropertyFieldType,
} from './object-types-data';

/**
 * A detail while it is being edited, carrying an identity that is NOT its key.
 *
 * The key follows the label as you type ("Warranty expires" → warrantyExpires),
 * so anything keyed by it — the React key, the which-row-is-open state — is
 * re-minted on every keystroke: the row remounts, focus is lost, and only the
 * first character you typed survives. `uid` is minted once when the row appears
 * and never changes, which is what makes the row survive both renaming and
 * reordering. It is editor state only and never reaches the server.
 */
interface DraftField {
  uid: string;
  field: PropertyField;
}

let uidCounter = 0;
function newUid(): string {
  uidCounter += 1;
  return `f${String(uidCounter)}`;
}

interface Draft {
  key: string;
  label: string;
  labelPlural: string;
  description: string;
  primaryFieldKey: string;
  fields: DraftField[];
}

/**
 * A first guess at the plural, offered as a starting point rather than imposed.
 *
 * English is irregular and this is not a linguistics problem worth solving —
 * "Person" will come out "Persons" and somebody will fix it in the box next to
 * it, which takes two seconds and is the point of showing it as a value instead
 * of applying it silently at save time. It handles the endings that would look
 * careless if it did not: -y → -ies, and the sibilants that need -es.
 */
function pluralise(singular: string): string {
  const word = singular.trim();
  if (word === '') return '';
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

const EMPTY_DRAFT: Draft = {
  key: '',
  label: '',
  labelPlural: '',
  description: '',
  primaryFieldKey: '',
  fields: [],
};

/** Everything that would be SENT, and nothing that would not — `uid` is editor
 *  bookkeeping, so including it would make a reload look like an edit. */
function snapshotOf(draft: Draft): string {
  return JSON.stringify({
    key: draft.key,
    label: draft.label,
    labelPlural: draft.labelPlural,
    description: draft.description,
    primaryFieldKey: draft.primaryFieldKey,
    fields: draft.fields.map((row) => row.field),
  });
}

export function ObjectTypeDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  // Pane params arrive on the context, not as a prop — same as every other
  // detail surface in the app.
  const objectKey = typeof ctx.params.key === 'string' ? ctx.params.key : 'new';
  const isNew = objectKey === 'new';
  const toast = useToast();
  const confirm = useConfirm();

  const { data: type, isPending, isError } = useObjectType(objectKey);
  const create = useCreateObjectType();
  const update = useUpdateObjectType(objectKey);
  const archive = useArchiveObjectType(objectKey);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // Stops the guessed plural from overwriting one they typed themselves.
  const [pluralTouched, setPluralTouched] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  /** What the draft looked like when it was last in agreement with the server. */
  const [baseline, setBaseline] = useState(() => snapshotOf(EMPTY_DRAFT));

  useEffect(() => {
    if (isNew) {
      setLoaded(true);
      return;
    }
    if (!type) return;
    const next: Draft = {
      key: type.key,
      label: type.label,
      labelPlural: type.labelPlural,
      description: type.description ?? '',
      primaryFieldKey: type.primaryFieldKey ?? '',
      fields: (type.propertySchema?.fields ?? []).map((field) => ({ uid: newUid(), field })),
    };
    setDraft(next);
    setBaseline(snapshotOf(next));
    setLoaded(true);
  }, [type, isNew]);

  // Explicit save means the pane can be closed with work in it, so it has to say
  // so — a record type someone spent five minutes describing is exactly the kind
  // of thing the workbench's unsaved-work guard exists for.
  const snapshot = useMemo(() => snapshotOf(draft), [draft]);
  useDirtySource(
    loaded && snapshot !== baseline,
    'This record type has changes you have not saved. Close it anyway?'
  );

  const isBuiltin = type?.kind === 'builtin';

  const nameError =
    draft.label.trim() === '' ? 'Give this record type a name, like "Project".' : null;
  const keyError =
    isNew && draft.key.trim() !== '' && !/^[a-z][a-z0-9_]*$/.test(draft.key.trim())
      ? 'Use lowercase letters, numbers and underscores, starting with a letter.'
      : null;
  const duplicateKeys = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const { field } of draft.fields) {
      if (seen.has(field.key)) dupes.add(field.key);
      seen.add(field.key);
    }
    return dupes;
  }, [draft.fields]);

  const blocked =
    nameError ?? keyError ?? (duplicateKeys.size > 0 ? 'Two details share a name.' : null);
  const saving = create.isPending || update.isPending;

  const setField = (index: number, next: PropertyField) => {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((row, i) => (i === index ? { ...row, field: next } : row)),
    }));
  };

  const addField = () => {
    const label = `Detail ${String(draft.fields.length + 1)}`;
    const row: DraftField = {
      uid: newUid(),
      field: { key: keyFromLabel(label), label, type: 'text' },
    };
    setDraft((d) => ({ ...d, fields: [...d.fields, row] }));
    setExpanded(row.uid);
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.fields.length) return;
    setDraft((d) => {
      const next = [...d.fields];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved!);
      return { ...d, fields: next };
    });
  };

  const removeField = async (index: number) => {
    const field = draft.fields[index]?.field;
    if (!field) return;
    const ok = await confirm({
      title: `Remove "${field.label}"?`,
      description:
        'It disappears from every one of these records. What was already filled in is kept, so adding it back brings the values with it.',
      confirmLabel: 'Remove it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    setDraft((d) => ({ ...d, fields: d.fields.filter((_, i) => i !== index) }));
  };

  async function save() {
    const payload = {
      label: draft.label.trim(),
      labelPlural: (draft.labelPlural.trim() || draft.label.trim()) + '',
      description: draft.description.trim() || null,
      propertySchema: { fields: draft.fields.map((row) => row.field) },
      primaryFieldKey: draft.primaryFieldKey.trim() || null,
    };

    try {
      if (isNew) {
        const created = await create.mutateAsync({
          ...payload,
          key: draft.key.trim() || keyFromLabel(draft.label).toLowerCase(),
        });
        // Cleared BEFORE the pane swap, or the guard fires on the way out of a
        // draft that has just been written.
        setBaseline(snapshot);
        toast.add({ title: `${created.labelPlural} added`, type: 'success' });
        ctx.open('crm.object-type.detail', { key: created.key });
      } else {
        await update.mutateAsync(payload);
        setBaseline(snapshot);
        toast.add({ title: 'Saved', type: 'success' });
      }
    } catch (error) {
      toast.add({
        title: 'Could not save that',
        description: objectTypeErrorMessage(
          error,
          'Something went wrong reaching the server. Nothing has been changed.'
        ),
        type: 'error',
      });
    }
  }

  if (!isNew && isError) {
    return (
      <div className={PANE_SHELL}>
        <EmptyState
          icon={<Boxes className="size-6" aria-hidden />}
          title="Could not open that record type"
          description="This is a problem reaching the server, or the record type has been removed."
        />
      </div>
    );
  }

  if (!loaded || (!isNew && isPending)) {
    return (
      <div className={PANE_SHELL}>
        <p className="p-4 text-sm" role="status">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Record type actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto shrink-0"
            disabled={blocked !== null || saving}
            title={blocked ?? undefined}
            onClick={() => {
              void save();
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        }
        controls={
          <>
            {isBuiltin ? (
              <Badge color="info" variant="soft" size="sm">
                Comes with sparx
              </Badge>
            ) : null}
            {isBuiltin || isNew ? null : (
              <Button
                color="danger"
                variant="ghost"
                size="sm"
                onClick={() => {
                  void (async () => {
                    const ok = await confirm({
                      title: `Put away ${draft.labelPlural || draft.label}?`,
                      description:
                        'It stops appearing in your sidebar and search. Everything already recorded is kept and comes back if you restore it.',
                      confirmLabel: 'Put it away',
                      cancelLabel: 'Keep it',
                      color: 'warning',
                    });
                    if (!ok) return;
                    await archive.mutateAsync();
                    toast.add({ title: 'Put away', type: 'success' });
                  })();
                }}
              >
                Put away
              </Button>
            )}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
          <FormSection
            title="What this is"
            description="The name you want to see in your sidebar and on your records."
          >
            <Field>
              <FieldLabel>Name for one</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.label}
                    placeholder="Project"
                    onChange={(e) => {
                      const label = e.target.value;
                      setDraft((d) => ({
                        ...d,
                        label,
                        // Follow the singular until somebody types their own
                        // plural, the same way the address below follows the
                        // name. It has to be a real VALUE, not a placeholder:
                        // a greyed "Projects" that saves as "Project" is a
                        // field that lied about what it was going to do, and
                        // the sidebar afterwards is where you find out.
                        labelPlural: pluralTouched ? d.labelPlural : pluralise(label),
                        key: isNew && d.key === '' ? '' : d.key,
                      }));
                    }}
                  />
                }
              />
              {nameError ? <FieldDescription>{nameError}</FieldDescription> : null}
            </Field>

            <Field>
              <FieldLabel>Name for many</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={draft.labelPlural}
                    placeholder="Projects"
                    onChange={(e) => {
                      setPluralTouched(true);
                      setDraft((d) => ({ ...d, labelPlural: e.target.value }));
                    }}
                  />
                }
              />
              <FieldDescription>
                Filled in from the name above — change it for a word that does not simply take an
                &ldquo;s&rdquo;, or clear it if the word is the same either way.
              </FieldDescription>
            </Field>

            {isNew ? (
              <Field>
                <FieldLabel>Short name for links</FieldLabel>
                <FieldControl
                  render={
                    <Input
                      color="module"
                      value={draft.key}
                      placeholder="project"
                      onChange={(e) => {
                        setDraft((d) => ({ ...d, key: e.target.value }));
                      }}
                      onBlur={() => {
                        setDraft((d) => ({
                          ...d,
                          key: d.key.trim() || keyFromLabel(d.label).toLowerCase(),
                        }));
                      }}
                    />
                  }
                />
                <FieldDescription>
                  {keyError ??
                    'Used in web addresses and by anything connected to sparx. It cannot be changed later.'}
                </FieldDescription>
              </Field>
            ) : null}

            <Field>
              <FieldLabel>What it is for</FieldLabel>
              <FieldControl
                render={
                  <Textarea
                    color="module"
                    rows={2}
                    value={draft.description}
                    placeholder="A piece of work we run for a customer, from the go-ahead to the final invoice."
                    onChange={(e) => {
                      setDraft((d) => ({ ...d, description: e.target.value }));
                    }}
                  />
                }
              />
            </Field>
          </FormSection>

          <FormSection
            title="The details you track"
            description="Add anything you keep about these records that sparx does not already ask for."
          >
            {duplicateKeys.size > 0 ? (
              <Alert color="danger" variant="soft">
                Two details share the same short name. Give each one its own, or one will overwrite
                the other.
              </Alert>
            ) : null}

            {draft.fields.length === 0 ? (
              <p className="py-4 text-sm">
                Nothing extra yet. Whatever you keep on a sticky note or a spare column in a
                spreadsheet belongs here.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {draft.fields.map(({ uid, field }, index) => (
                  <FieldRow
                    key={uid}
                    field={field}
                    index={index}
                    total={draft.fields.length}
                    duplicate={duplicateKeys.has(field.key)}
                    expanded={expanded === uid}
                    onToggle={() => {
                      setExpanded((e) => (e === uid ? null : uid));
                    }}
                    onChange={(next) => {
                      setField(index, next);
                    }}
                    onMove={(direction) => {
                      moveField(index, direction);
                    }}
                    onRemove={() => {
                      void removeField(index);
                    }}
                  />
                ))}
              </div>
            )}

            <Button size="sm" color="module" variant="outline" onClick={addField}>
              <Plus className="size-4" aria-hidden />
              Add a detail
            </Button>
          </FormSection>

          {!isBuiltin && draft.fields.length > 0 ? (
            <FormSection
              title="Which detail names the record"
              description="The one shown in lists and search results, the way a customer's name is."
            >
              <Field>
                <FieldLabel>Name it by</FieldLabel>
                <FieldControl
                  render={
                    <NativeSelect
                      color="module"
                      value={draft.primaryFieldKey}
                      onChange={(e) => {
                        setDraft((d) => ({ ...d, primaryFieldKey: e.target.value }));
                      }}
                    >
                      <option value="">Nothing — just show when it was added</option>
                      {draft.fields
                        .filter(({ field }) => field.type === 'text' || field.type === 'number')
                        .map(({ uid, field }) => (
                          <option key={uid} value={field.key}>
                            {field.label}
                          </option>
                        ))}
                    </NativeSelect>
                  }
                />
              </Field>
            </FormSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── One detail row ─────────────────────────────────────────────────────── */

function FieldRow({
  field,
  index,
  total,
  duplicate,
  expanded,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  field: PropertyField;
  index: number;
  total: number;
  duplicate: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (next: PropertyField) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <Card className={`p-3 ${duplicate ? 'border-danger border-2' : 'border-base-300 border'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="font-medium">{field.label || 'Untitled detail'}</span>
          <Badge color="module" variant="soft" size="sm" className="ml-2">
            {FIELD_TYPE_LABELS[field.type]}
          </Badge>
          {field.required ? (
            <Badge color="warning" variant="soft" size="sm" className="ml-1">
              Must be filled in
            </Badge>
          ) : null}
        </button>

        <Button
          size="sm"
          color="neutral"
          variant="ghost"
          aria-label="Move up"
          disabled={index === 0}
          onClick={() => {
            onMove(-1);
          }}
        >
          <ChevronUp className="size-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          color="neutral"
          variant="ghost"
          aria-label="Move down"
          disabled={index === total - 1}
          onClick={() => {
            onMove(1);
          }}
        >
          <ChevronDown className="size-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          color="danger"
          variant="ghost"
          aria-label={`Remove ${field.label}`}
          onClick={onRemove}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>

      {expanded ? (
        <div className="mt-3 flex flex-col gap-3 border-t pt-3">
          <Field>
            <FieldLabel>What you call it</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  value={field.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    onChange({
                      ...field,
                      label,
                      // The key follows the label only while it still matches —
                      // once someone has data under a key, renaming the label
                      // must not silently orphan it.
                      key:
                        field.key === keyFromLabel(field.label) ? keyFromLabel(label) : field.key,
                    });
                  }}
                />
              }
            />
            <FieldDescription>Saved as {field.key || '—'}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>What kind of detail</FieldLabel>
            <FieldControl
              render={
                <NativeSelect
                  color="module"
                  value={field.type}
                  onChange={(e) => {
                    onChange({ ...field, type: e.target.value as PropertyFieldType });
                  }}
                >
                  <optgroup label="Everyday">
                    {COMMON_FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {FIELD_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="More">
                    {ADVANCED_FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {FIELD_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </optgroup>
                </NativeSelect>
              }
            />
            <FieldDescription>{FIELD_TYPE_HINTS[field.type]}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Hint shown under it</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  value={field.helpText ?? ''}
                  placeholder="The date the cover runs out."
                  onChange={(e) => {
                    onChange({ ...field, helpText: e.target.value || undefined });
                  }}
                />
              }
            />
          </Field>

          {field.type === 'enum' ? <EnumOptionsEditor field={field} onChange={onChange} /> : null}

          {field.type === 'calculated' ? (
            <Field>
              <FieldLabel>How to work it out</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={field.expression ?? ''}
                    placeholder="price - cost"
                    onChange={(e) => {
                      onChange({ ...field, expression: e.target.value });
                    }}
                  />
                }
              />
              <FieldDescription>
                Use the short names of the other details, with + − × (as *) and ÷ (as /). Brackets
                work. So does round(…, 2).
              </FieldDescription>
            </Field>
          ) : null}

          {field.type === 'currency' ? (
            <Field>
              <FieldLabel>Currency</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={field.currency ?? 'USD'}
                    maxLength={3}
                    onChange={(e) => {
                      onChange({ ...field, currency: e.target.value.toUpperCase() });
                    }}
                  />
                }
              />
            </Field>
          ) : null}

          {field.type !== 'calculated' ? (
            <Field>
              <FieldLabel>Must be filled in</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={field.required === true}
                    onCheckedChange={(next: boolean) => {
                      onChange({ ...field, required: next || undefined });
                    }}
                  />
                }
              />
            </Field>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function EnumOptionsEditor({
  field,
  onChange,
}: {
  field: PropertyField;
  onChange: (next: PropertyField) => void;
}) {
  const options = field.options ?? [];
  return (
    <Field>
      <FieldLabel>The choices</FieldLabel>
      <div className="flex flex-col gap-2">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              color="module"
              value={option.label}
              placeholder="Gold"
              onChange={(e) => {
                const label = e.target.value;
                onChange({
                  ...field,
                  options: options.map((o, i) =>
                    i === index ? { label, value: keyFromLabel(label) || label } : o
                  ),
                });
              }}
            />
            <Button
              size="sm"
              color="danger"
              variant="ghost"
              aria-label={`Remove ${option.label}`}
              onClick={() => {
                onChange({ ...field, options: options.filter((_, i) => i !== index) });
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          color="module"
          variant="outline"
          onClick={() => {
            onChange({ ...field, options: [...options, { label: '', value: '' }] });
          }}
        >
          <Plus className="size-4" aria-hidden />
          Add a choice
        </Button>
      </div>
      <FieldDescription>At least one choice is needed.</FieldDescription>
    </Field>
  );
}
