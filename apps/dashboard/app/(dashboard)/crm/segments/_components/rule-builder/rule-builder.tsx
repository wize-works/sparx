'use client';

// Top-level visual rule builder. Controlled component — `value` is the
// full SegmentRule tree, `onChange` fires on every edit. Pairs with the
// preview-count action which takes the same shape.
//
// Includes an optional "View JSON" disclosure so power users can verify
// or paste rules; that view is read-only and falls back to display only
// when the tree is structurally invalid.

import * as React from 'react';
import { Code2 } from 'lucide-react';
import { Button, Stack, Text } from '@sparx/ui';

import { RuleNode } from './rule-node';
import { type Rule, emptyGroup } from './types';

interface Props {
  value: Rule;
  onChange: (next: Rule) => void;
}

export function RuleBuilder({ value, onChange }: Props) {
  const [showJson, setShowJson] = React.useState(false);

  return (
    <Stack gap={3}>
      <RuleNode rule={value} onChange={onChange} />
      <Stack direction="row" justify="between" align="center">
        <Text size="xs" variant="muted">
          Tip: groups nest. Use NOT to exclude a sub-tree.
        </Text>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowJson((s) => !s)}
          leftIcon={<Code2 className="h-3.5 w-3.5" />}
        >
          {showJson ? 'Hide JSON' : 'View JSON'}
        </Button>
      </Stack>
      {showJson && (
        <pre className="overflow-auto rounded-md border border-[var(--color-border-default)] bg-[var(--color-surface-subtle)] p-3 font-mono text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </Stack>
  );
}

/** Bootstrap a sensible default rule — a single predicate inside an AND
 *  group, ready for the user to refine. */
export function defaultRule(): Rule {
  return emptyGroup('and');
}
