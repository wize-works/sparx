'use client';

// A node in the rule tree — dispatches between predicate row and group.
// Recursive: a group's children are rendered as RuleNodes themselves.

import { Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Stack } from '@sparx/ui';

import { PredicateRow } from './predicate-row';
import { type GroupKind, type Rule, emptyGroup, emptyNot, emptyPredicate } from './types';

interface Props {
  rule: Rule;
  onChange: (next: Rule) => void;
  /** Omitted for the root node (you can't delete the root). */
  onRemove?: () => void;
  depth?: number;
}

export function RuleNode({ rule, onChange, onRemove, depth = 0 }: Props) {
  if (rule.kind === 'predicate') {
    return (
      <PredicateRow
        field={rule.field}
        op={rule.op}
        value={rule.value}
        onChange={(next) =>
          onChange({
            kind: 'predicate',
            field: next.field,
            op: next.op,
            // SegmentRule's value union is the JSON-serialisable types we
            // validate elsewhere; widen via cast here since the UI surface
            // already constrains the runtime shape to those types.
            value: next.value as Extract<typeof rule, { kind: 'predicate' }>['value'],
          })
        }
        onRemove={onRemove}
      />
    );
  }

  if (rule.kind === 'not') {
    return (
      <Stack
        gap={2}
        className="rounded-md border border-dashed border-[var(--color-border-default)] p-3"
      >
        <Stack direction="row" align="center" justify="between">
          <Badge variant="outline">NOT</Badge>
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              aria-label="Remove NOT"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </Stack>
        <RuleNode
          rule={rule.child}
          depth={depth + 1}
          onChange={(child) => onChange({ kind: 'not', child })}
        />
      </Stack>
    );
  }

  // AND / OR
  const groupKind: GroupKind = rule.kind;
  return (
    <Stack
      gap={2}
      className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-subtle)] p-3"
    >
      <Stack direction="row" align="center" justify="between">
        <select
          className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-default)] px-2 py-1 text-xs font-medium uppercase"
          value={groupKind}
          onChange={(e) => onChange({ kind: e.target.value as GroupKind, children: rule.children })}
        >
          <option value="and">All of</option>
          <option value="or">Any of</option>
        </select>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            aria-label="Remove group"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </Stack>

      <Stack gap={2}>
        {rule.children.map((child, idx) => (
          <RuleNode
            key={idx}
            rule={child}
            depth={depth + 1}
            onChange={(next) =>
              onChange({
                kind: groupKind,
                children: rule.children.map((c, i) => (i === idx ? next : c)),
              })
            }
            onRemove={
              rule.children.length > 1
                ? () =>
                    onChange({
                      kind: groupKind,
                      children: rule.children.filter((_, i) => i !== idx),
                    })
                : undefined
            }
          />
        ))}
      </Stack>

      <Stack direction="row" gap={2}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({ kind: groupKind, children: [...rule.children, emptyPredicate()] })
          }
          leftIcon={<Plus className="h-3.5 w-3.5" />}
        >
          Add condition
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({ kind: groupKind, children: [...rule.children, emptyGroup('and')] })
          }
          leftIcon={<Plus className="h-3.5 w-3.5" />}
        >
          Add group
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ kind: groupKind, children: [...rule.children, emptyNot()] })}
          leftIcon={<Plus className="h-3.5 w-3.5" />}
        >
          Add NOT
        </Button>
      </Stack>
    </Stack>
  );
}
