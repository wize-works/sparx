'use client';

// One way to file content — set it up, then manage the labels inside it.
//
// Creating and managing are the SAME surface in two states. `{ key: 'new' }`
// sets up a new vocabulary; `{ key }` edits its settings and manages its terms.
// Making "new" a separate modal would mean building the settings form twice and
// keeping the two in sync forever — so it is one pane, per the workbench rule.
//
// TWO save models, on purpose. The taxonomy's own SETTINGS (its name, whether
// it nests) are one explicit Save with a dirty-guard, like every other editor.
// Its TERMS are a collection of independent records, not fields of the taxonomy
// — so each is added, renamed and deleted on its own, the way you manage domain
// records or an entry's revisions rather than the parent's Save. An open term
// editor still registers the dirty-guard while it holds unsaved text, so the
// safety net covers it too.
//
// NOT built on EditorLayout: there is a real form here but no running summary
// rail to sit beside it, so a bento would float a near-empty column. One
// centred, capped column instead, with the labels as the hero.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  EmptyState,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Switch,
  Text,
  Textarea,
  useToast,
} from '@wizeworks/silicaui-react';
import { useConfirm } from '../../lib/confirm';
import { Check, Pencil, Plus, Tags, Trash2, X } from 'lucide-react';
import { useDirtySource } from '../../lib/workbench/dirty';
import { afterPaneChange } from '../../lib/defer';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { FormSection } from '../../components/form-section';
import { RefreshButton } from '../../components/refresh-button';
import type { SurfaceContext } from '../../lib/surfaces/registry';
import { SaveFailure } from '@/components/save-failure';
import {
  buildTermTree,
  collectDescendants,
  isValidKey,
  taxonomyErrorMessage,
  taxonomyKind,
  toKey,
  useCreateTaxonomy,
  useCreateTerm,
  useDeleteTaxonomy,
  useDeleteTerm,
  useTaxonomy,
  useTerms,
  useUpdateTaxonomy,
  useUpdateTerm,
  type Taxonomy,
  type TaxonomyTerm,
  type TermNode,
} from './taxonomy-data';
import { PaneLoadError } from '../../components/pane-load-error';

/** The one column everything in this pane sits in. Centred and capped, because a
 *  pane torn onto a second monitor is otherwise 2000px of dead grey with a
 *  paragraph pinned to the left edge. */
const COLUMN = 'mx-auto flex w-full max-w-3xl flex-col gap-4';

export function TaxonomyDetailSurface({ ctx }: { ctx: SurfaceContext }) {
  const key = typeof ctx.params.key === 'string' ? ctx.params.key : 'new';
  return key === 'new' ? <CreateTaxonomy ctx={ctx} /> : <ManageTaxonomy ctx={ctx} taxKey={key} />;
}

/* ── Create ─────────────────────────────────────────────────────────────── */

function CreateTaxonomy({ ctx }: { ctx: SurfaceContext }) {
  const toast = useToast();
  const create = useCreateTaxonomy();

  const [name, setName] = useState('');
  const [pluralName, setPluralName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [hierarchical, setHierarchical] = useState(false);

  useEffect(() => {
    ctx.setTitle('New way to file');
  }, [ctx]);

  // The key is a machine reference nobody should have to think about, so it is
  // suggested from the name until (and unless) an advanced user edits it.
  const onName = (next: string) => {
    setName(next);
    if (!keyTouched) setKey(toKey(next));
  };

  const trimmedName = name.trim();
  const trimmedPlural = pluralName.trim();
  const keyOk = isValidKey(key);
  const dirty = (trimmedName !== '' || trimmedPlural !== '') && !create.isSuccess;
  useDirtySource(dirty, 'You have started something you have not saved. Close anyway?');

  const canCreate = trimmedName !== '' && trimmedPlural !== '' && keyOk;

  const failure = create.isError
    ? taxonomyErrorMessage(create.error, 'Could not create this. Nothing was saved.')
    : null;

  const submit = () => {
    if (!canCreate) return;
    create.mutate(
      { key, name: trimmedName, plural_name: trimmedPlural, hierarchical },
      {
        onSuccess: (created) => {
          // Becomes the manage view for the taxonomy that now exists — the same
          // pane, one state along. Toast follows the swap; see afterPaneChange.
          ctx.open('cms.taxonomy.detail', { key: created.key }, { target: 'replace' });
          afterPaneChange(() => {
            toast.add({ title: `${created.plural_name} created`, type: 'success' });
          });
        },
      }
    );
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="New taxonomy actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={!canCreate}
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
              A new way to file content
            </Heading>
            <Text>
              Give it a name — like Category or Tag. Once you create it, you can add the individual
              labels that go inside it.
            </Text>
          </div>

          <SaveFailure title="Could not create this" message={failure} />

          <FormSection title="Name">
            <Field>
              <FieldLabel>One of them</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={name}
                    placeholder="Category"
                    autoComplete="off"
                    onChange={(event) => {
                      onName(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>The singular — what you would call just one.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Many of them</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={pluralName}
                    placeholder="Categories"
                    autoComplete="off"
                    onChange={(event) => {
                      setPluralName(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                The plural — how this appears as a heading, like a list of “Categories”.
              </FieldDescription>
            </Field>
          </FormSection>

          <FormSection title="How it works" description="You can change either of these later.">
            <Field>
              <FieldLabel>Allow nesting</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={hierarchical}
                    onCheckedChange={(next: boolean) => {
                      setHierarchical(next);
                    }}
                  />
                }
              />
              <FieldDescription>
                Turn this on to let labels sit under one another, like Food › Desserts › Cakes.
                Leave it off for a plain list, the way tags usually work.
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Reference</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    className="font-mono text-sm"
                    value={key}
                    placeholder="category"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => {
                      setKeyTouched(true);
                      setKey(event.target.value);
                    }}
                  />
                }
              />
              <FieldDescription>
                {key !== '' && !keyOk
                  ? 'Use lowercase letters, numbers and underscores, starting with a letter — like blog_category.'
                  : 'A short code used to connect this to your content. We made one from the name; change it only if you have a reason to. This cannot be changed later.'}
              </FieldDescription>
            </Field>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

/* ── Manage ─────────────────────────────────────────────────────────────── */

interface Settings {
  name: string;
  pluralName: string;
  hierarchical: boolean;
}

function serializeSettings(settings: Settings): string {
  return JSON.stringify({
    name: settings.name.trim(),
    pluralName: settings.pluralName.trim(),
    hierarchical: settings.hierarchical,
  });
}

function ManageTaxonomy({ ctx, taxKey }: { ctx: SurfaceContext; taxKey: string }) {
  const { data: taxonomy, isPending, isError, isFetching, refetch } = useTaxonomy(taxKey);

  const [settings, setSettings] = useState<Settings | null>(null);
  const initialRef = useRef<string>('');
  // Initialise ONCE per taxonomy. Re-initialising on every refetch would wipe an
  // in-progress edit when a background refresh lands; Save resets the snapshot
  // itself, which is the only path that should.
  const initializedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!taxonomy) return;
    if (initializedFor.current === taxonomy.key) return;
    initializedFor.current = taxonomy.key;
    const next: Settings = {
      name: taxonomy.name,
      pluralName: taxonomy.plural_name,
      hierarchical: taxonomy.hierarchical,
    };
    setSettings(next);
    initialRef.current = serializeSettings(next);
  }, [taxonomy]);

  const dirty = settings !== null && serializeSettings(settings) !== initialRef.current;
  useDirtySource(dirty, 'You have unsaved changes to this. Close anyway?');

  const trimmedTitle = settings?.pluralName.trim() ?? '';
  const displayTitle =
    trimmedTitle !== '' ? trimmedTitle : (taxonomy?.plural_name ?? 'Tags & topics');
  useEffect(() => {
    ctx.setTitle(displayTitle);
  }, [ctx, displayTitle]);

  // No missing-state to pass: `useTaxonomy` selects out of the LIST, so a deleted label arrives as
  // null after a good load and is handled below, never as a 404.
  if (isError) {
    return (
      <PaneLoadError
        title="Could not load this label"
        description="This is a problem reaching the server. Your labels are unaffected."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  // Loaded, but no taxonomy has this key — it was deleted or never existed. A
  // dead form beside a dead Save is worse than saying so plainly.
  if (!isPending && !taxonomy) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          icon={<Tags className="size-6" aria-hidden />}
          title="This no longer exists"
          description="The way to file content you opened has been removed. Open another from the list."
        />
      </div>
    );
  }

  if (isPending || !taxonomy || !settings) {
    return (
      <p className="p-4 text-sm" role="status">
        Loading…
      </p>
    );
  }

  return (
    <ManageBody
      ctx={ctx}
      taxonomy={taxonomy}
      settings={settings}
      setSettings={setSettings}
      dirty={dirty}
      isFetching={isFetching}
      refetchTaxonomy={() => {
        void refetch();
      }}
      onSaved={(saved) => {
        const next: Settings = {
          name: saved.name,
          pluralName: saved.plural_name,
          hierarchical: saved.hierarchical,
        };
        setSettings(next);
        initialRef.current = serializeSettings(next);
      }}
    />
  );
}

interface ManageBodyProps {
  ctx: SurfaceContext;
  taxonomy: Taxonomy;
  settings: Settings;
  setSettings: (updater: (current: Settings | null) => Settings | null) => void;
  dirty: boolean;
  isFetching: boolean;
  refetchTaxonomy: () => void;
  onSaved: (saved: Taxonomy) => void;
}

function ManageBody({
  ctx,
  taxonomy,
  settings,
  setSettings,
  dirty,
  isFetching,
  refetchTaxonomy,
  onSaved,
}: ManageBodyProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const update = useUpdateTaxonomy(taxonomy.key);
  const del = useDeleteTaxonomy(taxonomy.key);

  const {
    data: terms,
    isPending: termsPending,
    isError: termsError,
    isFetching: termsFetching,
    dataUpdatedAt: termsUpdatedAt,
    refetch: refetchTerms,
  } = useTerms(taxonomy.key);

  const kind = taxonomyKind(settings.hierarchical);

  const nameOk = settings.name.trim() !== '';
  const pluralOk = settings.pluralName.trim() !== '';
  const canSave = dirty && nameOk && pluralOk;

  const save = () => {
    update.mutate(
      {
        name: settings.name.trim(),
        plural_name: settings.pluralName.trim(),
        hierarchical: settings.hierarchical,
      },
      {
        onSuccess: (saved) => {
          onSaved(saved);
          toast.add({ title: 'Saved', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save',
            description: taxonomyErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async () => {
    const count = taxonomy.term_count;
    const ok = await confirm({
      title: `Delete “${taxonomy.plural_name}”?`,
      description:
        count > 0
          ? `This removes this way of filing and all ${String(count)} of its labels, and takes those labels off any content using them. This cannot be undone.`
          : 'This removes this way of filing content. This cannot be undone.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    del.mutate(undefined, {
      onSuccess: () => {
        ctx.close();
        afterPaneChange(() => {
          toast.add({ title: `${taxonomy.plural_name} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        toast.add({
          title: 'Could not delete this',
          description: taxonomyErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Taxonomy actions"
        primary={
          <Button
            color="module"
            size="sm"
            className="ml-auto"
            disabled={!canSave}
            loading={update.isPending}
            onClick={save}
          >
            Save
          </Button>
        }
        controls={
          <>
            {kind ? (
              <Badge color="info" variant="soft" size="sm" title={kind.detail}>
                {kind.label}
              </Badge>
            ) : null}
            {/* This pane reads TWO queries — the taxonomy's settings and its terms —
            so one refresh reloads both. */}
          </>
        }
        refresh={
          <RefreshButton
            isFetching={isFetching || termsFetching}
            updatedAt={terms ? termsUpdatedAt : undefined}
            onRefresh={() => {
              refetchTaxonomy();
              void refetchTerms();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={COLUMN}>
          <FormSection title="Settings">
            <Field>
              <FieldLabel>Name — one of them</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={settings.name}
                    placeholder="Category"
                    autoComplete="off"
                    onChange={(event) => {
                      setSettings((current) =>
                        current ? { ...current, name: event.target.value } : current
                      );
                    }}
                  />
                }
              />
              <FieldDescription>The singular — what you would call just one.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Name — many of them</FieldLabel>
              <FieldControl
                render={
                  <Input
                    color="module"
                    value={settings.pluralName}
                    placeholder="Categories"
                    autoComplete="off"
                    onChange={(event) => {
                      setSettings((current) =>
                        current ? { ...current, pluralName: event.target.value } : current
                      );
                    }}
                  />
                }
              />
              <FieldDescription>The plural — how this appears as a heading.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel>Allow nesting</FieldLabel>
              <FieldControl
                render={
                  <Switch
                    color="module"
                    checked={settings.hierarchical}
                    onCheckedChange={(next: boolean) => {
                      setSettings((current) =>
                        current ? { ...current, hierarchical: next } : current
                      );
                    }}
                  />
                }
              />
              <FieldDescription>
                When on, labels can sit under one another. When off, they are a plain list.
              </FieldDescription>
            </Field>

            <div className="border-base-300 flex flex-col gap-1 border-t pt-3">
              <Text className="text-sm font-semibold">Reference</Text>
              <code className="bg-base-200 w-fit max-w-full rounded px-2 py-1 font-mono text-sm break-all">
                {taxonomy.key}
              </code>
              <Text className="text-sm">
                The code that connects this to your content. It cannot be changed.
              </Text>
            </div>
          </FormSection>

          <TermsSection
            taxonomyKey={taxonomy.key}
            singular={taxonomy.name}
            plural={taxonomy.plural_name}
            hierarchical={settings.hierarchical}
            terms={terms ?? []}
            isPending={termsPending}
            isError={termsError}
            onRetry={() => {
              void refetchTerms();
            }}
          />

          {/* Rare + irreversible: a plain row under a divider, not a card with
              equal weight to the settings someone came to change. */}
          <div className="border-base-300 mt-2 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex min-w-0 flex-col">
              <Text className="font-medium">Delete this</Text>
              <Text className="text-sm">
                Removes this way of filing and every label in it, for good.
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

/* ── Terms ──────────────────────────────────────────────────────────────── */

interface TermsSectionProps {
  taxonomyKey: string;
  singular: string;
  plural: string;
  hierarchical: boolean;
  terms: TaxonomyTerm[];
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}

function TermsSection({
  taxonomyKey,
  singular,
  plural,
  hierarchical,
  terms,
  isPending,
  isError,
  onRetry,
}: TermsSectionProps) {
  const lowerSingular = singular.toLowerCase();
  const lowerPlural = plural.toLowerCase();

  // When nesting is off, everything is top-level regardless of any parent links
  // left over from when it was on — so the view matches the setting.
  const tree = useMemo<TermNode[]>(() => {
    if (hierarchical) return buildTermTree(terms);
    return [...terms]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((term) => ({ ...term, children: [] }));
  }, [terms, hierarchical]);

  return (
    <FormSection
      title={plural}
      description={`The individual labels inside this. ${
        hierarchical ? 'Nesting is on, so a label can sit under another.' : 'They are a plain list.'
      }`}
    >
      <AddTermForm
        taxonomyKey={taxonomyKey}
        lowerSingular={lowerSingular}
        hierarchical={hierarchical}
        terms={terms}
      />

      {isError ? (
        <Alert color="warning">
          <AlertContent>
            <AlertTitle>Could not load the labels</AlertTitle>
            <AlertDescription>This is a problem reaching the server.</AlertDescription>
          </AlertContent>
          <Button size="sm" color="warning" variant="soft" onClick={onRetry}>
            Try again
          </Button>
        </Alert>
      ) : isPending ? (
        <Text className="text-sm" role="status">
          Loading…
        </Text>
      ) : terms.length === 0 ? (
        <Text className="text-sm">
          No {lowerPlural} yet. Add your first one above — it is what readers will click to see
          everything filed under it.
        </Text>
      ) : (
        <TermTree
          nodes={tree}
          taxonomyKey={taxonomyKey}
          lowerSingular={lowerSingular}
          hierarchical={hierarchical}
          terms={terms}
        />
      )}
    </FormSection>
  );
}

interface TermSharedProps {
  taxonomyKey: string;
  lowerSingular: string;
  hierarchical: boolean;
  terms: TaxonomyTerm[];
}

function TermTree({ nodes, ...shared }: { nodes: TermNode[] } & TermSharedProps) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        <li key={node.id}>
          <TermRow term={node} {...shared} />
          {node.children.length > 0 ? (
            <div className="border-base-300 ml-3 border-l pl-3">
              <TermTree nodes={node.children} {...shared} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function TermRow({
  term,
  taxonomyKey,
  lowerSingular,
  hierarchical,
  terms,
}: { term: TaxonomyTerm } & TermSharedProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const del = useDeleteTerm(taxonomyKey);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <TermEditor
        term={term}
        taxonomyKey={taxonomyKey}
        hierarchical={hierarchical}
        terms={terms}
        onDone={() => {
          setEditing(false);
        }}
      />
    );
  }

  const onDelete = async () => {
    const hasChildren = terms.some((candidate) => candidate.parent_term_id === term.id);
    const ok = await confirm({
      title: `Delete “${term.name}”?`,
      description: hasChildren
        ? `This takes “${term.name}” off any content using it. Anything filed under it moves up to the top level — it is not deleted. This cannot be undone.`
        : `This takes “${term.name}” off any content using it. This cannot be undone.`,
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    del.mutate(term.id, {
      onError: (error) => {
        toast.add({
          title: 'Could not delete this',
          description: taxonomyErrorMessage(error, 'Nothing was changed.'),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className="border-base-300 hover:bg-base-200 flex items-center gap-2 border-b py-2 pr-1 pl-2 last:border-b-0">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{term.name}</span>
        <span className="truncate font-mono text-sm">/{term.slug}</span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          shape="square"
          aria-label={`Edit ${term.name}`}
          title={`Edit this ${lowerSingular}`}
          onClick={() => {
            setEditing(true);
          }}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          color="danger"
          shape="square"
          loading={del.isPending}
          aria-label={`Delete ${term.name}`}
          title={`Delete this ${lowerSingular}`}
          onClick={() => {
            void onDelete();
          }}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function TermEditor({
  term,
  taxonomyKey,
  hierarchical,
  terms,
  onDone,
}: {
  term: TaxonomyTerm;
  taxonomyKey: string;
  hierarchical: boolean;
  terms: TaxonomyTerm[];
  onDone: () => void;
}) {
  const toast = useToast();
  const update = useUpdateTerm(taxonomyKey);

  const [name, setName] = useState(term.name);
  const [slug, setSlug] = useState(term.slug);
  const [description, setDescription] = useState(term.description ?? '');
  const [parent, setParent] = useState(term.parent_term_id ?? '');

  const changed =
    name !== term.name ||
    slug !== term.slug ||
    description !== (term.description ?? '') ||
    (hierarchical && parent !== (term.parent_term_id ?? ''));
  useDirtySource(changed, `You have unsaved changes to “${term.name}”. Close anyway?`);

  // A term cannot become a child of itself or of anything already beneath it —
  // the API only blocks the self case, so the deeper loop is prevented here.
  const blocked = useMemo(() => {
    const set = collectDescendants(term.id, terms);
    set.add(term.id);
    return set;
  }, [term.id, terms]);

  const parentOptions = useMemo(
    () =>
      terms
        .filter((candidate) => !blocked.has(candidate.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [terms, blocked]
  );

  const nameOk = name.trim() !== '';
  const slugOk = slug.trim() !== '';
  const canSave = changed && nameOk && slugOk;

  const save = () => {
    if (!canSave) return;
    update.mutate(
      {
        id: term.id,
        input: {
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() ? description.trim() : null,
          ...(hierarchical ? { parent_term_id: parent === '' ? null : parent } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.add({ title: 'Saved', type: 'success' });
          onDone();
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save',
            description: taxonomyErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <div className="border-base-300 my-2 flex flex-col gap-3 rounded-lg border p-3">
      <Field>
        <FieldLabel>Name</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={name}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          }
        />
      </Field>

      <Field>
        <FieldLabel>Web address piece</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              className="font-mono text-sm"
              value={slug}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                setSlug(event.target.value);
              }}
            />
          }
        />
        <FieldDescription>
          The part of the address for this label’s own page. Keep it short and simple.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Description</FieldLabel>
        <FieldControl
          render={
            <Textarea
              color="module"
              rows={2}
              value={description}
              placeholder="Optional — a sentence about what belongs here."
              onChange={(event) => {
                setDescription(event.target.value);
              }}
            />
          }
        />
      </Field>

      {hierarchical ? (
        <Field>
          <FieldLabel>Sits under</FieldLabel>
          <NativeSelect
            color="module"
            value={parent}
            aria-label="Parent label"
            onChange={(event) => {
              setParent(event.target.value);
            }}
          >
            <option value="">Top level (nothing above it)</option>
            {parentOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </NativeSelect>
          <FieldDescription>
            Choose a label to nest this beneath, or keep it at the top level.
          </FieldDescription>
        </Field>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          onClick={() => {
            onDone();
          }}
        >
          <X className="size-4" aria-hidden />
          Cancel
        </Button>
        <Button
          size="sm"
          color="module"
          disabled={!canSave}
          loading={update.isPending}
          onClick={save}
        >
          <Check className="size-4" aria-hidden />
          Save
        </Button>
      </div>
    </div>
  );
}

function AddTermForm({
  taxonomyKey,
  lowerSingular,
  hierarchical,
  terms,
}: {
  taxonomyKey: string;
  lowerSingular: string;
  hierarchical: boolean;
  terms: TaxonomyTerm[];
}) {
  const create = useCreateTerm(taxonomyKey);
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');

  const parentOptions = useMemo(
    () => [...terms].sort((a, b) => a.name.localeCompare(b.name)),
    [terms]
  );

  const trimmed = name.trim();

  const add = () => {
    if (trimmed === '') return;
    create.mutate(
      {
        name: trimmed,
        ...(hierarchical && parent !== '' ? { parent_term_id: parent } : {}),
      },
      {
        onSuccess: () => {
          setName('');
          setParent('');
        },
      }
    );
  };

  const failure = create.isError
    ? taxonomyErrorMessage(create.error, 'Could not add that. Nothing was changed.')
    : null;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <Input
            color="module"
            size="sm"
            aria-label={`New ${lowerSingular} name`}
            placeholder={`Add a ${lowerSingular}…`}
            value={name}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>
        {hierarchical && parentOptions.length > 0 ? (
          <NativeSelect
            color="module"
            size="sm"
            value={parent}
            aria-label="Sits under"
            onChange={(event) => {
              setParent(event.target.value);
            }}
          >
            <option value="">Top level</option>
            {parentOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <Button
          type="submit"
          size="sm"
          color="module"
          disabled={trimmed === ''}
          loading={create.isPending}
        >
          <Plus className="size-4" aria-hidden />
          Add
        </Button>
      </div>
      {failure ? (
        <Alert color="error">
          <AlertContent>
            <AlertDescription>{failure}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}
    </form>
  );
}
