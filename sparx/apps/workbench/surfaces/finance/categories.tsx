'use client';

// SPENDING CATEGORIES — the owner's own vocabulary, and where each one lands.
//
// This screen looks like settings and is actually the most consequential thing
// in the module, because a category's KIND decides which side of the gross-profit
// line its spend falls on. File "van insurance" as cost of the work and every
// job looks less profitable than it is; file "brake pads" as a running cost and
// every job looks better. So the three kinds are explained in full here rather
// than offered as a bare dropdown, and each one carries the color it will wear
// everywhere else — a person picking "Wages" sees the blue they will later see
// on the profit screen.
//
// SEEDED CATEGORIES CAN BE RENAMED BUT NEVER DELETED. A deriver finds them by
// slug, so removing one would break the thing that files spend automatically.
// They can be archived, which hides them from the pickers and keeps history
// readable — and archiving is offered for invented ones too, because a category
// with costs behind it is part of last year's records.
//
// DELETE IS ONLY OFFERED WHERE IT IS POSSIBLE: invented, and never used. The
// server enforces it; showing the button anyway and explaining the refusal
// afterwards would be worse than not showing it.

import { useMemo, useState } from 'react';
import {
  Alert,
  AlertContent,
  AlertDescription,
  Badge,
  Button,
  Card,
  Field,
  FieldControl,
  FieldLabel,
  Heading,
  Input,
  NativeSelect,
  Switch,
  Text,
  useToast,
} from '@wizeworks/silicaui-react';
import { Archive, FolderTree, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { PaneToolbar, PANE_SHELL } from '../../components/pane-toolbar';
import { RefreshButton } from '../../components/refresh-button';
import { FormSection } from '../../components/form-section';
import { useConfirm } from '../../lib/confirm';
import { afterPaneChange } from '../../lib/defer';
import {
  spendErrorMessage,
  useArchiveCategory,
  useDeleteCategory,
  useExpenseCategories,
  useSaveCategory,
  type ExpenseCategory,
  type ExpenseKind,
} from './spend-data';
import { kindColor, kindHelp, kindLabel } from './format';

const KINDS: ExpenseKind[] = ['cost_of_sale', 'labor', 'operating'];

function CategoryEditor({
  category,
  onDone,
}: {
  category: ExpenseCategory | null;
  onDone: () => void;
}) {
  const toast = useToast();
  const save = useSaveCategory(category?.id ?? null);
  const [name, setName] = useState(category?.name ?? '');
  const [kind, setKind] = useState<ExpenseKind>(category?.kind ?? 'operating');

  const canSave = name.trim() !== '';

  const onSave = () => {
    if (!canSave) return;
    save.mutate(
      { name: name.trim(), kind },
      {
        onSuccess: () => {
          onDone();
          afterPaneChange(() => {
            toast.add({
              title: category ? `${name.trim()} saved` : `${name.trim()} added`,
              description:
                category && category.kind !== kind
                  ? 'Everything already filed here moves with it, so your past profit figures will change.'
                  : undefined,
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not save that category',
            description: spendErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  return (
    <FormSection
      title={category ? `Edit ${category.name}` : 'Add a category'}
      action={
        <Button
          size="sm"
          variant="ghost"
          color="neutral"
          shape="square"
          aria-label="Cancel"
          onClick={onDone}
        >
          <X className="size-4" aria-hidden />
        </Button>
      }
    >
      <Field>
        <FieldLabel required>Name</FieldLabel>
        <FieldControl
          render={
            <Input
              color="module"
              value={name}
              placeholder="Tools and equipment"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          }
        />
      </Field>

      <Field>
        <FieldLabel required>What kind of cost is it</FieldLabel>
        <FieldControl
          render={
            <NativeSelect
              color="module"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as ExpenseKind);
              }}
            >
              {KINDS.map((option) => (
                <option key={option} value={option}>
                  {kindLabel(option)}
                </option>
              ))}
            </NativeSelect>
          }
        />
      </Field>

      {/* The choice explained where it is made, not in a help page. This is the
          decision that moves every job's margin. */}
      <Alert color={kindColor(kind)} variant="soft">
        <AlertContent>
          <AlertDescription>{kindHelp(kind)}</AlertDescription>
        </AlertContent>
      </Alert>

      {category && category.kind !== kind ? (
        <Alert color="warning">
          <AlertContent>
            <AlertDescription>
              Every cost already filed under {category.name} moves to{' '}
              {kindLabel(kind).toLowerCase()} too, so your profit figures for past periods will
              change. That is usually what you want when a category was filed wrongly — just know it
              is not only going forward.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          color="module"
          disabled={!canSave}
          loading={save.isPending}
          onClick={onSave}
        >
          <Save className="size-4" aria-hidden />
          {category ? 'Save' : 'Add it'}
        </Button>
        <Button size="sm" variant="ghost" color="neutral" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </FormSection>
  );
}

export function CategoriesSurface() {
  const toast = useToast();
  const confirm = useConfirm();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isPending, isError, isFetching, dataUpdatedAt, refetch } =
    useExpenseCategories(showArchived);
  const archive = useArchiveCategory();
  const remove = useDeleteCategory();

  const grouped = useMemo(() => {
    const out = new Map<ExpenseKind, ExpenseCategory[]>();
    for (const kind of KINDS) out.set(kind, []);
    for (const category of data ?? []) {
      out.get(category.kind)?.push(category);
    }
    for (const list of out.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
    return out;
  }, [data]);

  const toggleArchive = async (category: ExpenseCategory) => {
    const archiving = category.archivedAt === null;
    if (archiving) {
      const ok = await confirm({
        title: `Archive ${category.name}?`,
        description:
          'It stops appearing when you record a cost. Everything already filed under it keeps its category and still counts towards your profit exactly as it does now.',
        confirmLabel: 'Archive it',
        cancelLabel: 'Keep it',
        color: 'danger',
      });
      if (!ok) return;
    }
    archive.mutate(
      { id: category.id, archived: archiving },
      {
        onSuccess: () => {
          afterPaneChange(() => {
            toast.add({
              title: archiving ? `${category.name} archived` : `${category.name} is back`,
              type: 'success',
            });
          });
        },
        onError: (error) => {
          toast.add({
            title: 'Could not change that',
            description: spendErrorMessage(error, 'Nothing was changed.'),
            type: 'error',
          });
        },
      }
    );
  };

  const onDelete = async (category: ExpenseCategory) => {
    const ok = await confirm({
      title: `Delete ${category.name}?`,
      description:
        'Nothing has been filed under it, so nothing is lost. If you record a cost against it later you would need to create it again.',
      confirmLabel: 'Delete it',
      cancelLabel: 'Keep it',
      color: 'danger',
    });
    if (!ok) return;
    remove.mutate(category.id, {
      onSuccess: () => {
        afterPaneChange(() => {
          toast.add({ title: `${category.name} deleted`, type: 'success' });
        });
      },
      onError: (error) => {
        // The server refuses when costs exist and names the count — worth
        // showing verbatim rather than paraphrasing it away.
        toast.add({
          title: 'Could not delete that category',
          description: spendErrorMessage(
            error,
            'It may still be in use. Archive it instead to hide it without losing history.'
          ),
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={PANE_SHELL}>
      <PaneToolbar
        label="Category actions"
        controls={
          <>
            <Button
              size="sm"
              color="module"
              onClick={() => {
                setAdding(true);
                setEditing(null);
              }}
            >
              <Plus className="size-4" aria-hidden />
              Add a category
            </Button>
            <div className="flex items-center gap-2">
              <Switch
                id="categories-show-archived"
                color="module"
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              <label htmlFor="categories-show-archived" className="text-sm whitespace-nowrap">
                Include archived
              </label>
            </div>
          </>
        }
        refresh={
          <RefreshButton
            className="ml-auto"
            isFetching={isFetching}
            updatedAt={data ? dataUpdatedAt : undefined}
            onRefresh={() => {
              void refetch();
            }}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <div className="p-4">
            <Alert color="danger" variant="soft">
              <AlertContent>
                <AlertDescription>
                  Could not load your categories. The server could not be reached — your categories
                  are unaffected.
                </AlertDescription>
              </AlertContent>
              <Button
                size="sm"
                color="danger"
                variant="soft"
                onClick={() => {
                  void refetch();
                }}
              >
                Try again
              </Button>
            </Alert>
          </div>
        ) : isPending || !data ? (
          <p className="p-4 text-sm" role="status">
            Loading…
          </p>
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {adding ? (
              <CategoryEditor
                category={null}
                onDone={() => {
                  setAdding(false);
                }}
              />
            ) : null}

            {KINDS.map((kind) => {
              const list = grouped.get(kind) ?? [];
              return (
                <Card key={kind} className="flex flex-col gap-3 p-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Heading level={2} className="text-lg font-semibold">
                        {kindLabel(kind)}
                      </Heading>
                      <Badge color={kindColor(kind)} variant="soft" size="sm">
                        {list.length === 1 ? '1 category' : `${String(list.length)} categories`}
                      </Badge>
                    </div>
                    <Text className="text-sm">{kindHelp(kind)}</Text>
                  </div>

                  {list.length === 0 ? (
                    <Text className="text-sm">
                      Nothing filed here yet. Add a category and choose {kindLabel(kind)} to start
                      tracking this kind of cost.
                    </Text>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {list.map((category) =>
                        editing === category.id ? (
                          <li key={category.id}>
                            <CategoryEditor
                              category={category}
                              onDone={() => {
                                setEditing(null);
                              }}
                            />
                          </li>
                        ) : (
                          <li
                            key={category.id}
                            className="border-base-300 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                          >
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <Badge color={kindColor(kind)} variant="soft" size="sm">
                                {category.name}
                              </Badge>
                              {category.isSystem ? (
                                <Text as="span" className="text-sm">
                                  Built in
                                </Text>
                              ) : null}
                              {category.archivedAt ? (
                                <Badge color="neutral" variant="soft" size="sm">
                                  Archived
                                </Badge>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                color="neutral"
                                shape="square"
                                aria-label={`Edit ${category.name}`}
                                onClick={() => {
                                  setEditing(category.id);
                                  setAdding(false);
                                }}
                              >
                                <Pencil className="size-4" aria-hidden />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                color={category.archivedAt ? 'success' : 'neutral'}
                                shape="square"
                                aria-label={
                                  category.archivedAt
                                    ? `Bring ${category.name} back`
                                    : `Archive ${category.name}`
                                }
                                onClick={() => {
                                  void toggleArchive(category);
                                }}
                              >
                                {category.archivedAt ? (
                                  <RotateCcw className="size-4" aria-hidden />
                                ) : (
                                  <Archive className="size-4" aria-hidden />
                                )}
                              </Button>
                              {/* Only where it can actually succeed — a built-in
                                  category is addressed by name from a deriver. */}
                              {category.isSystem ? null : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  color="danger"
                                  shape="square"
                                  aria-label={`Delete ${category.name}`}
                                  onClick={() => {
                                    void onDelete(category);
                                  }}
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                </Button>
                              )}
                            </div>
                          </li>
                        )
                      )}
                    </ul>
                  )}
                </Card>
              );
            })}

            <Card className="flex items-start gap-3 p-4">
              <FolderTree className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div className="flex min-w-0 flex-col gap-1">
                <Text className="font-medium">Why the three groups matter</Text>
                <Text className="text-sm">
                  Cost of the work comes off first, and what is left is what the work itself made.
                  Wages and running costs come off after that, and what is left then is what you
                  actually kept. Filing a cost in the wrong group does not change your bottom line —
                  but it does change whether a job looks worth doing.
                </Text>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
