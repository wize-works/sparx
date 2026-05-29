'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  Heading,
  Input,
  Label,
  Stack,
  Text,
} from '@sparx/ui';
import { ArrowRight, FileUp, Plus, Trash2 } from 'lucide-react';
import { bulkImportRedirects, createRedirect, deleteRedirect } from './actions';

interface RedirectRow {
  id: string;
  from_path: string;
  to_path: string;
  status_code: number;
  hit_count: number;
  created_at: string;
}

export function RedirectsList({ rows }: { rows: RedirectRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await createRedirect(data);
      if (!result.ok) {
        setError(result.error ?? 'Could not create redirect.');
        return;
      }
      setMessage('Redirect added.');
      form.reset();
      router.refresh();
    });
  }

  function onDelete(id: string, fromPath: string) {
    if (!confirm(`Remove redirect "${fromPath}"?`)) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteRedirect(id);
      if (!result.ok) {
        setError(result.error ?? 'Could not delete redirect.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <Stack gap={5}>
      <Card>
        <CardHeader>
          <Heading level={3}>Add redirect</Heading>
          <CardDescription>
            Paths must begin with a slash. Same-path or loop targets are rejected.
          </CardDescription>
        </CardHeader>
        <form onSubmit={onCreate}>
          <CardContent>
            <Stack gap={4}>
              <Stack direction="row" gap={3} align="end">
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="from_path">From</Label>
                  <Input id="from_path" name="from_path" placeholder="/old-path" required />
                </Stack>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="to_path">To</Label>
                  <Input id="to_path" name="to_path" placeholder="/new-path" required />
                </Stack>
                <Stack gap={1}>
                  <Label htmlFor="status_code">Status</Label>
                  <select
                    id="status_code"
                    name="status_code"
                    defaultValue={301}
                    className="rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm"
                  >
                    <option value={301}>301 Permanent</option>
                    <option value={302}>302 Found</option>
                    <option value={307}>307 Temporary</option>
                    <option value={308}>308 Permanent (keep method)</option>
                  </select>
                </Stack>
              </Stack>
            </Stack>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              variant="module"
              leftIcon={<Plus className="h-4 w-4" />}
              disabled={pending}
            >
              Add redirect
            </Button>
          </CardFooter>
        </form>
      </Card>

      <BulkUploadCard
        onDone={(msg) => {
          setMessage(msg);
          router.refresh();
        }}
        onError={(msg) => setError(msg)}
        disabled={pending}
      />

      {error && (
        <Text size="sm" variant="danger" role="alert" aria-live="polite">
          {error}
        </Text>
      )}
      {message && (
        <Text size="sm" variant="success" aria-live="polite">
          {message}
        </Text>
      )}

      <Card>
        <CardHeader>
          <Heading level={3}>Existing redirects</Heading>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <Text variant="muted">No redirects yet.</Text>
          ) : (
            <Stack gap={2}>
              {rows.map((r) => (
                <Stack
                  key={r.id}
                  direction="row"
                  align="center"
                  justify="between"
                  className="rounded-md border border-[var(--color-border-default)] px-3 py-2"
                >
                  <Stack direction="row" align="center" gap={3} className="min-w-0 flex-1">
                    <Badge variant="outline">{r.status_code}</Badge>
                    <Text size="sm" className="truncate font-mono">
                      {r.from_path}
                    </Text>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
                    <Text size="sm" className="truncate font-mono">
                      {r.to_path}
                    </Text>
                  </Stack>
                  <Stack direction="row" align="center" gap={2}>
                    <Text size="xs" variant="muted">
                      {r.hit_count} hits
                    </Text>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      leftIcon={<Trash2 className="h-3 w-3" />}
                      onClick={() => onDelete(r.id, r.from_path)}
                      disabled={pending}
                    >
                      Remove
                    </Button>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

function BulkUploadCard({
  onDone,
  onError,
  disabled,
}: {
  onDone: (msg: string) => void;
  onError: (msg: string) => void;
  disabled: boolean;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [pending, startTransition] = React.useTransition();
  const [skipped, setSkipped] = React.useState<{ line: number; reason: string }[]>([]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSkipped([]);
    void file.text().then((text) => {
      startTransition(async () => {
        const result = await bulkImportRedirects(text);
        if (fileRef.current) fileRef.current.value = '';
        if (!result.ok) {
          onError(result.error ?? 'Bulk import failed.');
          return;
        }
        onDone(
          `Imported ${result.data?.imported ?? 0} redirects` +
            (result.data?.failed.length ? ` (${result.data.failed.length} skipped)` : '.')
        );
        setSkipped(result.data?.failed ?? []);
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <Heading level={3}>Bulk import</Heading>
        <CardDescription>
          CSV with columns: <code>from_path, to_path, status_code</code>. Status defaults to 301.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onChange}
          className="hidden"
          aria-label="Choose CSV"
        />
        <Stack direction="row" gap={2}>
          <Button
            type="button"
            variant="ghost"
            leftIcon={<FileUp className="h-4 w-4" />}
            onClick={() => fileRef.current?.click()}
            disabled={disabled || pending}
            loading={pending}
          >
            Choose CSV
          </Button>
        </Stack>
        {skipped.length > 0 && (
          <Stack gap={1} className="mt-3">
            <Text size="sm" variant="danger">
              Skipped {skipped.length} invalid {skipped.length === 1 ? 'row' : 'rows'}:
            </Text>
            {skipped.slice(0, 5).map((s) => (
              <Text key={s.line} size="xs" variant="muted">
                Line {s.line}: {s.reason}
              </Text>
            ))}
            {skipped.length > 5 && (
              <Text size="xs" variant="muted">
                …and {skipped.length - 5} more.
              </Text>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
