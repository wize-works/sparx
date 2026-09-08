'use client';

// One content type — define it, then manage it.
//
// Defining and managing are the SAME surface in two states, exactly like the
// Content editor. `{ key: 'new' }` starts a blank definition; `{ key }` edits an
// existing one. A separate "create" modal would mean building the field builder
// twice and keeping the two in sync forever — so it is one pane (the workbench
// rule), and the field builder itself is inline in the pane's own draft: adding,
// configuring and reordering fields never touches the server until Save.
//
// The schema this authors is exactly what surfaces/cms/schema-form.tsx renders a
// form from — the two share the FieldDef vocabulary through content-types-data.ts
// (a mirror of @wizeworks/cms-schemas, validated server-side). Nothing here can author
// a field the editor cannot show.
//
// Built-in types are platform-owned and read-only. When one is opened it renders
// view-only — its identity and its fields, plainly — with no Save and no Delete.
//
// Explicit-save only: one Save button, last write wins. An unsaved edit registers
// the leave-guard, so closing or navigating away asks first. Not built on
// EditorLayout — the field builder IS the work and wants the full width of one
// centred, capped column, not a bento with a near-empty rail.

import { useEffect, useMemo, useRef, useState } from 'react';
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
  NativeSelect,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { ChevronDown, ChevronRight, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { contentErrorMessage } from './data';
import { SaveFailure } from '@/components/save-failure';
import {
  FIELD_TYPES,
  blankField,
  fromDraftFields,
  toDraftFields,
  toFieldKey,
  toTypeKey,
  useContentType,
  useContentTypeList,
  useCreateContentType,
  useDeleteContentType,
  useEntryCountsByType,
  useSaveContentType,
  validateFields,
  type ContentType,
  type CreateTypeInput,
  type DraftField,
  type EnumOption,
  type FieldType,
  type TypeMetaInput,
} from './content-types-data';
import { PaneLoadError } from '../../components/pane-load-error';

const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

/** How deep groups may nest. A generous ceiling that keeps the builder from
 *  offering "a group in a group in a group in a group" — past this, the add menu
 *  drops the two nesting types. The schema itself allows any depth. */
const MAX_NEST_DEPTH = 3;

const TYPE_KEY_RE = /^[a-z][a-z0-9_]*$/;

/** Every field type, named for what it DOES rather than its schema word. */
const FIELD_TYPE_META: Record<FieldType, { label: string; hint: string }> = {
  text: { label: 'Short text', hint: 'A single line — a title, a name, a heading.' },
  long_text: { label: 'Long text', hint: 'Several lines of plain writing, with no formatting.' },
  rich_text: {
    label: 'Formatted text',
    hint: 'A full editor with headings, lists, links and pictures.',
  },
  slug: {
    label: 'Web address piece',
    hint: 'The end of the page address, in lowercase letters and dashes.',
  },
  number: { label: 'Number', hint: 'A figure — a price, a count, a rating.' },
  boolean: { label: 'Yes or no', hint: 'A single on/off switch.' },
  date: { label: 'Date', hint: 'A day, with no time.' },
  datetime: { label: 'Date and time', hint: 'A day and a time together.' },
  enum: { label: 'Pick from a list', hint: 'A fixed set of choices you write out.' },
  url: { label: 'Web link', hint: 'A full web address to somewhere else.' },
  email: { label: 'Email address', hint: 'A single email address.' },
  reference: {
    label: 'Link to other content',
    hint: 'Points at another entry — a post to its author, a recipe to a chef.',
  },
  asset: { label: 'Image or file', hint: 'Pick from your media library, or upload something.' },
  object: { label: 'Group', hint: 'A set of related fields bundled under one heading.' },
  repeater: {
    label: 'Repeating group',
    hint: 'A group the writer can add over and over — ingredients, FAQs, steps.',
  },
};

/** Common accept sets for image/file fields, in plain words. */
const ACCEPT_PRESETS: { pattern: string; label: string }[] = [
  { pattern: 'image/*', label: 'Images' },
  { pattern: 'video/*', label: 'Videos' },
  { pattern: 'application/pdf', label: 'PDF documents' },
];

export function ContentTypeDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const key = typeof ctx.params.key === 'string' ? ctx.params.key : 'new';
  return key === 'new' ? <CreateType ctx={ctx} /> : <LoadType ctx={ctx} typeKey={key} />;
}

/* ── The shared draft ───────────────────────────────────────────────────── */

interface TypeDraft {
  name: string;
  pluralName: string;
  key: string;
  description: string;
  urlPattern: string;
  icon: string;
  isSingleton: boolean;
  fields: DraftField[];
}

function draftFromType(type: ContentType): TypeDraft {
  return {
    name: type.name,
    pluralName: type.plural_name,
    key: type.key,
    description: type.description ?? '',
    urlPattern: type.url_pattern ?? '',
    icon: type.icon ?? '',
    isSingleton: type.is_singleton,
    fields: toDraftFields(type.schema_json.fields),
  };
}

/** A stable signature of a draft, for the dirty check AND as the payload's raw
 *  material — fields are normalised to the wire shape so a `_uid` reshuffle or a
 *  trailing space never reads as a change. */
function signature(draft: TypeDraft): string {
  return JSON.stringify({
    name: draft.name.trim(),
    pluralName: draft.pluralName.trim(),
    key: draft.key.trim(),
    description: draft.description.trim(),
    urlPattern: draft.urlPattern.trim(),
    icon: draft.icon.trim(),
    isSingleton: draft.isSingleton,
    fields: fromDraftFields(draft.fields),
  });
}

function metaPayload(draft: TypeDraft): TypeMetaInput {
  const trimmed = (value: string) => (value.trim() ? value.trim() : null);
  return {
    name: draft.name.trim(),
    plural_name: draft.pluralName.trim(),
    description: trimmed(draft.description),
    icon: trimmed(draft.icon),
    url_pattern: trimmed(draft.urlPattern),
    is_singleton: draft.isSingleton,
  };
}

function createPayload(draft: TypeDraft): CreateTypeInput {
  const opt = (value: string) => (value.trim() ? { value: value.trim() } : null);
  return {
    key: draft.key.trim(),
    name: draft.name.trim(),
    plural_name: draft.pluralName.trim(),
    ...(opt(draft.description) ? { description: draft.description.trim() } : {}),
    ...(opt(draft.icon) ? { icon: draft.icon.trim() } : {}),
    ...(opt(draft.urlPattern) ? { url_pattern: draft.urlPattern.trim() } : {}),
    is_singleton: draft.isSingleton,
    schema: { fields: fromDraftFields(draft.fields) },
  };
}

/** The first thing stopping a save, in plain words, or null when it is ready. */
function metaProblem(draft: TypeDraft, forCreate: boolean): string | null {
  if (draft.name.trim() === '') return 'Give this type a name.';
  if (draft.pluralName.trim() === '') return 'Fill in the plural name.';
  if (forCreate) {
    const key = draft.key.trim();
    if (key === '') return 'Give this type a short id.';
    if (!TYPE_KEY_RE.test(key)) {
      return 'The id must start with a lowercase letter and use only lowercase letters, numbers and underscores.';
    }
  }
  return validateFields(draft.fields);
}

/* ── Create ─────────────────────────────────────────────────────────────── */

function CreateType({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const create = useCreateContentType();

  // Seed a required Title field: almost every content type wants one, it satisfies
  // the server's "at least one field" rule out of the gate, and `title` is the key
  // the Content list reads to name a row.
  const [draft, setDraft] = useState<TypeDraft>(() => ({
    name: '',
    pluralName: '',
    key: '',
    description: '',
    urlPattern: '',
    icon: '',
    isSingleton: false,
    fields: [{ ...blankField('text'), key: 'title', label: 'Title', required: true }],
  }));
  const initialRef = useRef<string>('');
  if (initialRef.current === '') initialRef.current = signature(draft);
  // Whether the id was hand-edited — until it is, it tracks the name automatically.
  const keyTouched = useRef(false);

  useEffect(() => {
    ctx.setTitle('New content type');
  }, [ctx]);

  const dirty = signature(draft) !== initialRef.current && !create.isSuccess;
  useDirtySource(dirty, 'You have started a content type you have not saved. Close anyway?');

  const problem = metaProblem(draft, true);
  const failure = create.isError
    ? contentErrorMessage(create.error, 'Could not create this. Nothing was saved.')
    : null;

  const onName = (name: string) => {
    setDraft((current) => ({
      ...current,
      name,
      key: keyTouched.current ? current.key : toTypeKey(name),
    }));
  };

  const submit = () => {
    if (problem) return;
    create.mutate(createPayload(draft), {
      onSuccess: (type) => {
        ctx.open('cms.types.detail', { key: type.key }, { target: 'replace' });
        afterPaneChange(() => {
          toast.add({ title: `${type.name} created`, type: 'success' });
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New content type actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={Boolean(problem)}
            loading={create.isPending}
            onClick={submit}
          >
            Create
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <Heading level={1} className="text-2xl font-semibold">
              Define a kind of content
            </Heading>
            <Text>
              Name it, then give it the fields it needs. Once you save it, you can start creating
              content of this kind straight away.
            </Text>
          </div>

          <SaveFailure title="Could not create this" message={failure} />

          <MetaForm
            draft={draft}
            setDraft={setDraft}
            onName={onName}
            onKeyEdited={() => (keyTouched.current = true)}
            editableKey
          />

          <FieldsSection draft={draft} setDraft={setDraft} />

          {problem && !failure ? <Text className="text-sm">{problem}</Text> : null}
        </div>
      </div>
    </div>
  );
}

/* ── Load an existing type ──────────────────────────────────────────────── */

function LoadType({ ctx, typeKey }: { ctx: SurfaceContext; typeKey: string }) {
  const {
    data: type,
    isPending,
    isError,
    error,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useContentType(typeKey);

  useEffect(() => {
    if (type) ctx.setTitle(type.name);
  }, [ctx, type]);

  if (isError) {
    return (
      <PaneLoadError
        error={error}
        noun="content type"
        title="Could not load this content type"
        description="This is a problem reaching the server. The type itself is unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (isPending || !type) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  if (type.is_built_in) {
    return (
      <BuiltInType
        type={type}
        isFetching={isFetching}
        dataUpdatedAt={dataUpdatedAt}
        refetch={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <EditType
      ctx={ctx}
      type={type}
      isFetching={isFetching}
      dataUpdatedAt={dataUpdatedAt}
      refetch={() => {
        void refetch();
      }}
    />
  );
}

/* ── Edit / manage a custom type ────────────────────────────────────────── */

function EditType({
  ctx,
  type,
  isFetching,
  dataUpdatedAt,
  refetch,
}: {
  ctx: SurfaceContext;
  type: ContentType;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const save = useSaveContentType(type.key);
  const del = useDeleteContentType(type.key);
  const { data: counts } = useEntryCountsByType();

  const [draft, setDraft] = useState<TypeDraft>(() => draftFromType(type));
  const initialRef = useRef<string>(signature(draftFromType(type)));
  // Initialise ONCE per key — a background refetch must not wipe an in-progress
  // edit. Save resets the snapshot itself.
  const initializedFor = useRef<string>(type.key);
  useEffect(() => {
    if (initializedFor.current === type.key) return;
    initializedFor.current = type.key;
    const next = draftFromType(type);
    setDraft(next);
    initialRef.current = signature(next);
  }, [type]);

  const dirty = signature(draft) !== initialRef.current;
  useDirtySource(dirty, 'You have unsaved changes to this content type. Close anyway?');

  const problem = metaProblem(draft, false);
  const entryCount = counts?.get(type.key) ?? 0;

  const onSave = () => {
    if (problem) return;
    save.mutate(
      { meta: metaPayload(draft), schema: { fields: fromDraftFields(draft.fields) } },
      {
        onSuccess: (saved) => {
          const next = draftFromType(saved);
          setDraft(next);
          initialRef.current = signature(next);
          toast.add({ title: 'Saved', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save',
            description: contentErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${type.name}”?`,
      description:
        entryCount > 0
          ? `${String(entryCount)} ${entryCount === 1 ? 'entry uses' : 'entries use'} this type. You cannot delete it until those are removed — archiving them is not enough. This cannot be undone.`
          : `This removes the “${type.name}” type and its fields for good. This cannot be undone.`,
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    del.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${type.name} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this',
          description: contentErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Content type actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={!dirty || Boolean(problem)}
            loading={save.isPending}
            onClick={onSave}
          >
            Save
          </Button>
        }
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={dataUpdatedAt} onRefresh={refetch} />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <MetaForm
            draft={draft}
            setDraft={setDraft}
            onName={(name) => setDraft((c) => ({ ...c, name }))}
            editableKey={false}
          />

          <FieldsSection draft={draft} setDraft={setDraft} />

          {problem && dirty ? <Text className="text-sm">{problem}</Text> : null}

          {/* Destructive action as a plain row under a divider — not a card with
              equal weight to the definition above it. */}
          <div className="border-base-300 mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex min-w-0 flex-col">
              <Text className="font-medium">Delete this type</Text>
              <Text className="text-sm">
                {entryCount > 0
                  ? `${String(entryCount)} ${entryCount === 1 ? 'entry uses' : 'entries use'} it, so it cannot be deleted yet.`
                  : 'Removes the type and its fields for good. This cannot be undone.'}
              </Text>
            </div>
            <Button
              size="sm"
              variant="outline"
              color="danger"
              loading={del.isPending}
              onClick={() => {
                void onDelete();
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Built-in type (view only) ──────────────────────────────────────────── */

function BuiltInType({
  type,
  isFetching,
  dataUpdatedAt,
  refetch,
}: {
  type: ContentType;
  isFetching: boolean;
  dataUpdatedAt: number;
  refetch: () => void;
}) {
  const fields = useMemo(() => toDraftFields(type.schema_json.fields), [type]);

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Content type actions"
        controls={
          <>
            <Badge color="info" variant="soft" size="sm">
              Built-in
            </Badge>
          </>
        }
        refresh={
          <RefreshButton isFetching={isFetching} updatedAt={dataUpdatedAt} onRefresh={refetch} />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <div className="flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <Heading level={1} className="text-2xl font-semibold">
                {type.name}
              </Heading>
              <span className="font-mono text-sm">{type.key}</span>
              {type.is_singleton ? (
                <Badge color="info" variant="soft" size="sm">
                  Only one
                </Badge>
              ) : null}
            </span>
            {type.description ? <Text>{type.description}</Text> : null}
            {type.url_pattern ? (
              <Text className="font-mono text-sm">Lives at {type.url_pattern}</Text>
            ) : null}
          </div>

          <Alert color="info">
            <AlertContent>
              <AlertTitle>This is a built-in type</AlertTitle>
              <AlertDescription>
                It comes with sparx and is shared across every business, so its fields cannot be
                changed or removed here. You can create as much content of this kind as you like.
              </AlertDescription>
            </AlertContent>
          </Alert>

          <FormSection title="Fields" description="What every entry of this kind holds.">
            {fields.length === 0 ? (
              <Text className="text-sm">This type has no fields.</Text>
            ) : (
              <ReadonlyFieldList fields={fields} />
            )}
          </FormSection>
        </div>
      </div>
    </div>
  );
}

function ReadonlyFieldList({ fields }: { fields: DraftField[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {fields.map((field) => (
        <li key={field._uid} className="border-base-300 flex flex-col gap-2 rounded-md border p-3">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{field.label || 'Untitled field'}</span>
            <span className="font-mono text-sm">{field.key}</span>
            <Badge color="neutral" variant="soft" size="sm">
              {FIELD_TYPE_META[field.type].label}
            </Badge>
            {field.required ? (
              <Badge color="warning" variant="soft" size="sm">
                Required
              </Badge>
            ) : null}
          </span>
          {field.helpText ? <Text className="text-sm">{field.helpText}</Text> : null}
          {(field.type === 'object' || field.type === 'repeater') && field.fields.length > 0 ? (
            <div className="border-base-300 border-l-2 pl-3">
              <ReadonlyFieldList fields={field.fields} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/* ── Meta form ──────────────────────────────────────────────────────────── */

function MetaForm({
  draft,
  setDraft,
  onName,
  onKeyEdited,
  editableKey,
}: {
  draft: TypeDraft;
  setDraft: React.Dispatch<React.SetStateAction<TypeDraft>>;
  onName: (name: string) => void;
  onKeyEdited?: () => void;
  editableKey: boolean;
}) {
  const set = <K extends keyof TypeDraft>(key: K, value: TypeDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <FormSection title="About this type" description="What you call it and where it lives.">
      <div className="grid gap-4 @lg:grid-cols-2">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={draft.name}
                placeholder="Recipe"
                onChange={(event) => {
                  onName(event.target.value);
                }}
              />
            }
          />
          <FieldDescription>What you call a single one of these.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Plural name</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={draft.pluralName}
                placeholder="Recipes"
                onChange={(event) => {
                  set('pluralName', event.target.value);
                }}
              />
            }
          />
          <FieldDescription>What you call several — shown in menus and headings.</FieldDescription>
        </Field>
      </div>

      <Field>
        <FieldLabel>Id</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              className="font-mono text-sm"
              value={draft.key}
              placeholder="recipe"
              autoComplete="off"
              spellCheck={false}
              disabled={!editableKey}
              onChange={(event) => {
                onKeyEdited?.();
                set('key', event.target.value);
              }}
            />
          }
        />
        <FieldDescription>
          {editableKey
            ? 'A short internal name in lowercase letters, numbers and underscores. Filled in from the name — change it now if you like, it cannot be changed later.'
            : 'The internal name for this type. It is fixed once the type is created.'}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Description</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={draft.description}
              placeholder="A dish with ingredients and steps."
              onChange={(event) => {
                set('description', event.target.value);
              }}
            />
          }
        />
        <FieldDescription>One line on what this kind of content is for. Optional.</FieldDescription>
      </Field>

      <Field className="max-w-xs">
        <FieldLabel>Icon</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={draft.icon}
              placeholder="An emoji or short symbol"
              maxLength={60}
              onChange={(event) => {
                set('icon', event.target.value);
              }}
            />
          }
        />
        <FieldDescription>
          A small symbol shown next to this type in menus, such as an emoji. Optional.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Web address pattern</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              className="font-mono text-sm"
              value={draft.urlPattern}
              placeholder="/recipes/{slug}"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                set('urlPattern', event.target.value);
              }}
            />
          }
        />
        <FieldDescription>
          Where these appear on your site. Use {'{slug}'} for the part that changes per entry — e.g.
          /recipes/{'{slug}'}. Leave it empty if this content does not get its own page.
        </FieldDescription>
      </Field>

      <div className="flex items-start gap-2">
        <Switch
          color="module"
          className="mt-1"
          checked={draft.isSingleton}
          aria-label="Only one of these"
          onCheckedChange={(next) => {
            set('isSingleton', next);
          }}
        />
        <span className="flex flex-col gap-0.5">
          <Text as="span">Only one of these</Text>
          <Text as="span" className="text-sm">
            Turn on for something there is only ever one of — an About page, your homepage, a set of
            site-wide settings. Leave off for things you make many of.
          </Text>
        </span>
      </div>
    </FormSection>
  );
}

/* ── The field builder ──────────────────────────────────────────────────── */

function FieldsSection({
  draft,
  setDraft,
}: {
  draft: TypeDraft;
  setDraft: React.Dispatch<React.SetStateAction<TypeDraft>>;
}) {
  const { data: types } = useContentTypeList();
  const typeOptions = useMemo(
    () => (types ?? []).map((type) => ({ key: type.key, name: type.name })),
    [types]
  );

  return (
    <FormSection
      title="Fields"
      description="The pieces of information every entry of this kind holds. Drag to reorder, or use the arrows."
    >
      <FieldBuilder
        fields={draft.fields}
        typeOptions={typeOptions}
        depth={0}
        onChange={(next) => {
          setDraft((current) => ({ ...current, fields: next }));
        }}
      />
    </FormSection>
  );
}

interface FieldBuilderProps {
  fields: DraftField[];
  typeOptions: { key: string; name: string }[];
  depth: number;
  onChange: (next: DraftField[]) => void;
}

function FieldBuilder({ fields, typeOptions, depth, onChange }: FieldBuilderProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [adding, setAdding] = useState<FieldType | ''>('');

  const move = (from: number, to: number) => {
    if (to < 0 || to >= fields.length || from === to) return;
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    onChange(next);
  };

  const patch = (index: number, nextField: DraftField) => {
    onChange(fields.map((field, i) => (i === index ? nextField : field)));
  };

  const remove = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const add = (type: FieldType) => {
    const field = blankField(type);
    onChange([...fields, field]);
    setOpen((current) => new Set(current).add(field._uid));
    setAdding('');
  };

  const canNest = depth < MAX_NEST_DEPTH;
  const addable = canNest
    ? FIELD_TYPES
    : FIELD_TYPES.filter((type) => type !== 'object' && type !== 'repeater');

  return (
    <div className="@container flex flex-col gap-3">
      {fields.length === 0 ? (
        <Text className="text-sm">No fields yet. Add the first one below.</Text>
      ) : (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <FieldRow
              key={field._uid}
              field={field}
              index={index}
              count={fields.length}
              depth={depth}
              siblingKeys={fields
                .filter((_, i) => i !== index)
                .map((f) => f.key)
                .filter(Boolean)}
              typeOptions={typeOptions}
              expanded={open.has(field._uid)}
              dropTarget={over === index && dragging !== null && dragging !== index}
              onToggle={() => {
                setOpen((current) => {
                  const next = new Set(current);
                  if (next.has(field._uid)) next.delete(field._uid);
                  else next.add(field._uid);
                  return next;
                });
              }}
              onChange={(nextField) => {
                patch(index, nextField);
              }}
              onRemove={() => {
                remove(index);
              }}
              onMove={move}
              onDragStart={() => {
                setDragging(index);
              }}
              onDragOver={() => {
                setOver(index);
              }}
              onDragEnd={() => {
                if (dragging !== null && over !== null) move(dragging, over);
                setDragging(null);
                setOver(null);
              }}
            />
          ))}
        </ul>
      )}

      <div className="flex max-w-xs items-center gap-2">
        <NativeSelect
          size="sm"
          color="module"
          aria-label="Add a field"
          value={adding}
          onChange={(event) => {
            const type = event.target.value as FieldType | '';
            if (type) add(type);
            else setAdding('');
          }}
        >
          <option value="">Add a field…</option>
          {addable.map((type) => (
            <option key={type} value={type}>
              {FIELD_TYPE_META[type].label}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

/* ── One field row ──────────────────────────────────────────────────────── */

interface FieldRowProps {
  field: DraftField;
  index: number;
  count: number;
  depth: number;
  siblingKeys: string[];
  typeOptions: { key: string; name: string }[];
  expanded: boolean;
  dropTarget: boolean;
  onToggle: () => void;
  onChange: (next: DraftField) => void;
  onRemove: () => void;
  onMove: (from: number, to: number) => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
}

function FieldRow({
  field,
  index,
  count,
  depth,
  siblingKeys,
  typeOptions,
  expanded,
  dropTarget,
  onToggle,
  onChange,
  onRemove,
  onMove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: FieldRowProps) {
  const label = field.label.trim() || 'Untitled field';

  return (
    <li
      // The WHOLE row is the drag surface (not a handle) — but dragging is off
      // while expanded, because the expanded body is full of inputs and a
      // draggable ancestor eats text selection and pointer focus inside them.
      draggable={!expanded}
      onDragStart={onDragStart}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDragEnd();
      }}
      onDragEnd={onDragEnd}
      className={`border-base-300 bg-base-100 rounded-md border ${
        dropTarget ? 'border-module border-dashed' : ''
      }`}
    >
      <div className="flex items-start gap-2 p-3">
        <div className="flex shrink-0 flex-col items-center pt-0.5">
          <GripVertical className="size-4 cursor-grab" aria-hidden />
        </div>

        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer flex-col items-start gap-1 text-left"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="flex flex-wrap items-center gap-2">
            {expanded ? (
              <ChevronDown className="size-4 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="size-4 shrink-0" aria-hidden />
            )}
            <span className="text-base font-semibold">{label}</span>
            {field.key ? <span className="font-mono text-sm">{field.key}</span> : null}
            <Badge color="neutral" variant="soft" size="sm">
              {FIELD_TYPE_META[field.type].label}
            </Badge>
            {field.required ? (
              <Badge color="warning" variant="soft" size="sm">
                Required
              </Badge>
            ) : null}
          </span>
          <Text className="text-sm">{FIELD_TYPE_META[field.type].hint}</Text>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            shape="square"
            aria-label={`Move ${label} up`}
            title="Move up"
            disabled={index === 0}
            onClick={() => {
              onMove(index, index - 1);
            }}
          >
            <ChevronUp className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            color="neutral"
            shape="square"
            aria-label={`Move ${label} down`}
            title="Move down"
            disabled={index === count - 1}
            onClick={() => {
              onMove(index, index + 1);
            }}
          >
            <ChevronDown className="size-4" aria-hidden />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            color="danger"
            shape="square"
            aria-label={`Remove ${label}`}
            title="Remove this field"
            onClick={onRemove}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="border-base-300 flex flex-col gap-4 border-t p-3">
          <FieldConfig
            field={field}
            depth={depth}
            siblingKeys={siblingKeys}
            typeOptions={typeOptions}
            onChange={onChange}
          />
        </div>
      ) : null}
    </li>
  );
}

/* ── One field's configuration ──────────────────────────────────────────── */

interface FieldConfigProps {
  field: DraftField;
  depth: number;
  siblingKeys: string[];
  typeOptions: { key: string; name: string }[];
  onChange: (next: DraftField) => void;
}

/** Change a field's type while keeping its name, id, help and required flag — so
 *  someone who picked the wrong type does not lose what they already filled in. */
function withType(field: DraftField, type: FieldType): DraftField {
  const fresh = blankField(type);
  return {
    ...fresh,
    _uid: field._uid,
    key: field.key,
    label: field.label,
    ...(field.helpText !== undefined ? { helpText: field.helpText } : {}),
    ...(field.required !== undefined ? { required: field.required } : {}),
  };
}

function FieldConfig({ field, depth, siblingKeys, typeOptions, onChange }: FieldConfigProps) {
  // A typed patch that stays on the current field's variant.
  const patch = (changes: Partial<DraftField>) => {
    onChange({ ...field, ...changes } as DraftField);
  };

  const onLabel = (labelValue: string) => {
    onChange({
      ...field,
      label: labelValue,
      // Fill the id from the label only while the id is still empty — never
      // clobber one the person has typed.
      key: field.key.trim() === '' ? toFieldKey(labelValue) : field.key,
    });
  };

  return (
    <>
      <div className="grid gap-4 @lg:grid-cols-2">
        <Field>
          <FieldLabel>Field name</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                value={field.label}
                placeholder="Cook time"
                onChange={(event) => {
                  onLabel(event.target.value);
                }}
              />
            }
          />
          <FieldDescription>What the writer sees above this field.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Field id</FieldLabel>
          <FieldControl
            render={
              <Input
                color="module"
                className="font-mono text-sm"
                value={field.key}
                placeholder="cookTime"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  patch({ key: event.target.value });
                }}
              />
            }
          />
          <FieldDescription>
            The internal name — lowercase to start, then letters, numbers or underscores.
          </FieldDescription>
        </Field>
      </div>

      <Field>
        <FieldLabel>Type of field</FieldLabel>
        <NativeSelect
          color="module"
          value={field.type}
          aria-label="Type of field"
          onChange={(event) => {
            onChange(withType(field, event.target.value as FieldType));
          }}
        >
          {FIELD_TYPES.map((type) => (
            <option key={type} value={type}>
              {FIELD_TYPE_META[type].label}
            </option>
          ))}
        </NativeSelect>
        <FieldDescription>{FIELD_TYPE_META[field.type].hint}</FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Help text</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={field.helpText ?? ''}
              placeholder="Shown under the field to guide the writer."
              onChange={(event) => {
                patch({ helpText: event.target.value });
              }}
            />
          }
        />
        <FieldDescription>A note shown beneath the field. Optional.</FieldDescription>
      </Field>

      <div className="flex items-center gap-2">
        <Switch
          color="module"
          checked={field.required === true}
          aria-label="Required"
          onCheckedChange={(next) => {
            patch({ required: next });
          }}
        />
        <Text as="span">The writer must fill this in</Text>
      </div>

      <TypeSpecificConfig
        field={field}
        depth={depth}
        siblingKeys={siblingKeys}
        typeOptions={typeOptions}
        onChange={onChange}
      />
    </>
  );
}

/* ── Per-type extras ────────────────────────────────────────────────────── */

function NumInput({
  value,
  onChange,
  placeholder,
  min,
}: {
  value: number | undefined;
  onChange: (next: number | undefined) => void;
  placeholder?: string;
  min?: number;
}) {
  return (
    <Input
      color="module"
      type="number"
      inputMode="numeric"
      value={value === undefined ? '' : String(value)}
      placeholder={placeholder}
      min={min}
      onChange={(event) => {
        const raw = event.target.value;
        if (raw.trim() === '') {
          onChange(undefined);
          return;
        }
        const parsed = Number(raw);
        onChange(Number.isFinite(parsed) ? parsed : undefined);
      }}
    />
  );
}

function TypeSpecificConfig({
  field,
  depth,
  siblingKeys,
  typeOptions,
  onChange,
}: FieldConfigProps) {
  const patch = (changes: Partial<DraftField>) => {
    onChange({ ...field, ...changes } as DraftField);
  };

  switch (field.type) {
    case 'text':
      return (
        <>
          <Field>
            <FieldLabel>Placeholder</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  value={field.placeholder ?? ''}
                  placeholder="Faint example text inside the empty box."
                  onChange={(event) => {
                    patch({ placeholder: event.target.value });
                  }}
                />
              }
            />
          </Field>
          <LengthLimits
            min={field.min}
            max={field.max}
            onMin={(min) => {
              patch({ min });
            }}
            onMax={(max) => {
              patch({ max });
            }}
          />
        </>
      );

    case 'long_text':
      return (
        <>
          <Field className="max-w-xs">
            <FieldLabel>Box height (lines)</FieldLabel>
            <FieldControl
              render={
                <NumInput
                  value={field.rows}
                  min={1}
                  placeholder="4"
                  onChange={(rows) => {
                    patch({ rows });
                  }}
                />
              }
            />
            <FieldDescription>How tall the writing box is to start. Optional.</FieldDescription>
          </Field>
          <LengthLimits
            min={field.min}
            max={field.max}
            onMin={(min) => {
              patch({ min });
            }}
            onMax={(max) => {
              patch({ max });
            }}
          />
        </>
      );

    case 'slug':
      return (
        <>
          <Field>
            <FieldLabel>Build it from</FieldLabel>
            <NativeSelect
              color="module"
              value={field.sourceField ?? ''}
              aria-label="Build the address from"
              onChange={(event) => {
                patch({ sourceField: event.target.value || undefined });
              }}
            >
              <option value="">Nothing — the writer types it</option>
              {siblingKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </NativeSelect>
            <FieldDescription>
              Make the address automatically from another field, such as the title. Optional.
            </FieldDescription>
          </Field>
          <Field className="max-w-xs">
            <FieldLabel>Longest allowed</FieldLabel>
            <FieldControl
              render={
                <NumInput
                  value={field.max}
                  min={1}
                  onChange={(max) => {
                    patch({ max });
                  }}
                />
              }
            />
          </Field>
        </>
      );

    case 'number':
      return (
        <>
          <div className="grid gap-4 @lg:grid-cols-2">
            <Field>
              <FieldLabel>Smallest allowed</FieldLabel>
              <FieldControl
                render={
                  <NumInput
                    value={field.min}
                    onChange={(min) => {
                      patch({ min });
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>Largest allowed</FieldLabel>
              <FieldControl
                render={
                  <NumInput
                    value={field.max}
                    onChange={(max) => {
                      patch({ max });
                    }}
                  />
                }
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              color="module"
              checked={field.integer === true}
              aria-label="Whole numbers only"
              onCheckedChange={(next) => {
                patch({ integer: next });
              }}
            />
            <Text as="span">Whole numbers only — no decimals</Text>
          </div>
        </>
      );

    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          <Switch
            color="module"
            checked={field.default === true}
            aria-label="On by default"
            onCheckedChange={(next) => {
              patch({ default: next });
            }}
          />
          <Text as="span">Start switched on for new entries</Text>
        </div>
      );

    case 'enum':
      return <EnumConfig field={field} onChange={onChange} />;

    case 'reference':
      return (
        <>
          <Field>
            <FieldLabel>Links to</FieldLabel>
            <NativeSelect
              color="module"
              value={field.to}
              aria-label="Links to"
              onChange={(event) => {
                patch({ to: event.target.value });
              }}
            >
              <option value="">Choose a kind of content…</option>
              {typeOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.name}
                </option>
              ))}
            </NativeSelect>
            <FieldDescription>Which kind of content this points at.</FieldDescription>
          </Field>
          <div className="flex items-center gap-2">
            <Switch
              color="module"
              checked={field.multiple === true}
              aria-label="Allow linking to several"
              onCheckedChange={(next) => {
                patch({ multiple: next });
              }}
            />
            <Text as="span">Allow linking to more than one</Text>
          </div>
          {field.multiple ? (
            <div className="grid gap-4 @lg:grid-cols-2">
              <Field>
                <FieldLabel>Fewest links</FieldLabel>
                <FieldControl
                  render={
                    <NumInput
                      value={field.min}
                      min={0}
                      onChange={(min) => {
                        patch({ min });
                      }}
                    />
                  }
                />
              </Field>
              <Field>
                <FieldLabel>Most links</FieldLabel>
                <FieldControl
                  render={
                    <NumInput
                      value={field.max}
                      min={1}
                      onChange={(max) => {
                        patch({ max });
                      }}
                    />
                  }
                />
              </Field>
            </div>
          ) : null}
        </>
      );

    case 'asset':
      return (
        <>
          <div className="flex flex-col gap-2">
            <Text className="text-sm font-medium">What can be picked</Text>
            <div className="flex flex-wrap gap-2">
              {ACCEPT_PRESETS.map((preset) => {
                const on = (field.accept ?? []).includes(preset.pattern);
                return (
                  <Button
                    key={preset.pattern}
                    type="button"
                    size="sm"
                    variant={on ? 'soft' : 'outline'}
                    color={on ? 'module' : 'neutral'}
                    aria-pressed={on}
                    onClick={() => {
                      const current = new Set(field.accept ?? []);
                      if (on) current.delete(preset.pattern);
                      else current.add(preset.pattern);
                      patch({ accept: [...current] });
                    }}
                  >
                    {preset.label}
                  </Button>
                );
              })}
            </div>
            <Text className="text-sm">Pick none to allow any kind of file.</Text>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              color="module"
              checked={field.multiple === true}
              aria-label="Allow several"
              onCheckedChange={(next) => {
                patch({ multiple: next });
              }}
            />
            <Text as="span">Allow choosing more than one</Text>
          </div>
        </>
      );

    case 'object':
      return (
        <div className="flex flex-col gap-3">
          <Text className="text-sm">The fields inside this group.</Text>
          <FieldBuilder
            fields={field.fields}
            typeOptions={typeOptions}
            depth={depth + 1}
            onChange={(next) => {
              patch({ fields: next });
            }}
          />
        </div>
      );

    case 'repeater':
      return (
        <>
          <Field>
            <FieldLabel>What one is called</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  value={field.itemLabel ?? ''}
                  placeholder="Ingredient"
                  onChange={(event) => {
                    patch({ itemLabel: event.target.value });
                  }}
                />
              }
            />
            <FieldDescription>
              The word for a single entry in the list — “Ingredient”, “Step”, “FAQ”. Shows on the
              Add button.
            </FieldDescription>
          </Field>
          <div className="grid gap-4 @lg:grid-cols-2">
            <Field>
              <FieldLabel>Fewest</FieldLabel>
              <FieldControl
                render={
                  <NumInput
                    value={field.min}
                    min={0}
                    onChange={(min) => {
                      patch({ min });
                    }}
                  />
                }
              />
            </Field>
            <Field>
              <FieldLabel>Most</FieldLabel>
              <FieldControl
                render={
                  <NumInput
                    value={field.max}
                    min={1}
                    onChange={(max) => {
                      patch({ max });
                    }}
                  />
                }
              />
            </Field>
          </div>
          <div className="flex flex-col gap-3">
            <Text className="text-sm">The fields inside each one.</Text>
            <FieldBuilder
              fields={field.fields}
              typeOptions={typeOptions}
              depth={depth + 1}
              onChange={(next) => {
                patch({ fields: next });
              }}
            />
          </div>
        </>
      );

    case 'rich_text':
    case 'date':
    case 'datetime':
    case 'url':
    case 'email':
    default:
      // These types have no extra settings.
      return null;
  }
}

function LengthLimits({
  min,
  max,
  onMin,
  onMax,
}: {
  min: number | undefined;
  max: number | undefined;
  onMin: (next: number | undefined) => void;
  onMax: (next: number | undefined) => void;
}) {
  return (
    <div className="grid gap-4 @lg:grid-cols-2">
      <Field>
        <FieldLabel>Shortest (characters)</FieldLabel>
        <FieldControl render={<NumInput value={min} min={0} onChange={onMin} />} />
      </Field>
      <Field>
        <FieldLabel>Longest (characters)</FieldLabel>
        <FieldControl render={<NumInput value={max} min={1} onChange={onMax} />} />
      </Field>
    </div>
  );
}

function EnumConfig({
  field,
  onChange,
}: {
  field: Extract<DraftField, { type: 'enum' }>;
  onChange: (next: DraftField) => void;
}) {
  const setOptions = (options: EnumOption[]) => {
    onChange({ ...field, options });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <Text className="text-sm font-medium">Choices</Text>
        <Text className="text-sm">
          The value is stored behind the scenes; the label is what the writer sees. They are often
          the same.
        </Text>
      </div>

      {field.options.map((option, index) => (
        // Positional key: options are not reorderable, so index identity is correct.
        <div key={index} className="flex items-end gap-2">
          <Field className="flex-1">
            <FieldLabel>Value</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  className="font-mono text-sm"
                  value={option.value}
                  placeholder="easy"
                  onChange={(event) => {
                    setOptions(
                      field.options.map((o, i) =>
                        i === index ? { ...o, value: event.target.value } : o
                      )
                    );
                  }}
                />
              }
            />
          </Field>
          <Field className="flex-1">
            <FieldLabel>Shown as</FieldLabel>
            <FieldControl
              render={
                <Input
                  color="module"
                  value={option.label}
                  placeholder="Easy"
                  onChange={(event) => {
                    setOptions(
                      field.options.map((o, i) =>
                        i === index ? { ...o, label: event.target.value } : o
                      )
                    );
                  }}
                />
              }
            />
          </Field>
          <Button
            size="sm"
            variant="ghost"
            color="danger"
            shape="square"
            aria-label={`Remove choice ${String(index + 1)}`}
            title="Remove this choice"
            disabled={field.options.length <= 1}
            onClick={() => {
              setOptions(field.options.filter((_, i) => i !== index));
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      ))}

      <div>
        <Button
          size="sm"
          variant="outline"
          color="module"
          onClick={() => {
            setOptions([...field.options, { value: '', label: '' }]);
          }}
        >
          <Plus className="size-4" aria-hidden />
          Add a choice
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          color="module"
          checked={field.multiple === true}
          aria-label="Allow choosing several"
          onCheckedChange={(next) => {
            onChange({ ...field, multiple: next });
          }}
        />
        <Text as="span">Allow choosing more than one</Text>
      </div>
    </div>
  );
}
