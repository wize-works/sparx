'use client';

// Entry reference picker — searches `/v1/content/entries` and lets the
// caller commit a `{ entryId, typeKey, label }` triple. Same UX is exposed
// to the rich-text editor via the @-mention popover; this modal is the
// version the schema-driven form uses for `reference` fields.

import * as React from 'react';
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  Stack,
  Text,
} from '@sparx/ui';
import { Search } from 'lucide-react';
import { searchEntries } from './cms-internal-api';

export interface PickedReference {
  entryId: string;
  typeKey: string;
  label: string;
}

export interface ReferencePickerProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onPick: (ref: PickedReference) => void;
  /** Restrict to a single content type — e.g. `blog_post`. */
  typeKey?: string;
}

interface Result {
  id: string;
  typeKey: string;
  slug: string | null;
  status: string;
  title: string;
}

export function ReferencePicker({ open, onOpenChange, onPick, typeKey }: ReferencePickerProps) {
  const [q, setQ] = React.useState('');
  const [results, setResults] = React.useState<Result[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Debounced search.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      searchEntries({ q, typeKey, limit: 20 })
        .then((rows) => {
          if (cancelled) return;
          setResults(rows);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : 'Search failed.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q, typeKey, open]);

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-xl">
        <ModalHeader>
          <ModalTitle>Pick an entry to reference</ModalTitle>
        </ModalHeader>
        <div className="px-6 py-2">
          <Stack gap={3}>
            <Stack direction="row" align="center" gap={2}>
              <Search className="h-4 w-4 text-[var(--color-text-tertiary)]" />
              <Input
                placeholder={
                  typeKey ? `Search ${typeKey.replace(/_/g, ' ')} entries…` : 'Search any entry…'
                }
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search entries"
              />
            </Stack>
            {loading && <Text variant="muted">Searching…</Text>}
            {error && <Text variant="danger">{error}</Text>}
            {!loading && !error && results.length === 0 && (
              <Text variant="muted">No entries match yet.</Text>
            )}
            <Stack gap={1} className="max-h-[50vh] overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() =>
                    onPick({
                      entryId: r.id,
                      typeKey: r.typeKey,
                      // Empty-string fallthrough — `??` would only catch
                      // null/undefined so `||` is the right semantic here.
                      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                      label: r.title || r.slug || r.id,
                    })
                  }
                  className="rounded-md border border-[var(--color-border-default)] px-3 py-2 text-left hover:bg-[var(--color-bg-subtle)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
                >
                  <Stack gap={0}>
                    {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
                    <Text size="sm">{r.title || r.slug || r.id}</Text>
                    <Text size="xs" variant="muted">
                      {r.typeKey}
                      {r.slug ? ` · /${r.slug}` : ''} · {r.status}
                    </Text>
                  </Stack>
                </button>
              ))}
            </Stack>
          </Stack>
        </div>
        <ModalFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
