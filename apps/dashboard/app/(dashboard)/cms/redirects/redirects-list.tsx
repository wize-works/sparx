'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  EmptyState,
  Heading,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
} from '@sparx/ui';
import { ArrowRight, FileUp, Plus, Trash2, Waypoints } from 'lucide-react';
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
  const [pendingDelete, setPendingDelete] = React.useState<RedirectRow | null>(null);
  const [statusCode, setStatusCode] = React.useState('301');
  const fromInputRef = React.useRef<HTMLInputElement>(null);

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    // Form's <Select> writes to React state, not native FormData — the
    // submission needs the value injected.
    data.set('status_code', statusCode);
    startTransition(async () => {
      const result = await createRedirect(data);
      if (!result.ok) {
        setError(result.error ?? 'Could not create redirect.');
        return;
      }
      setMessage('Redirect added.');
      form.reset();
      setStatusCode('301');
      router.refresh();
    });
  }

  function confirmDelete(row: RedirectRow) {
    setPendingDelete(row);
  }

  function executeDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteRedirect(target.id);
      if (!result.ok) {
        setError(result.error ?? 'Could not delete redirect.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <Stack gap={5}>
      <Card variant="module">
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
                  <Input
                    ref={fromInputRef}
                    id="from_path"
                    name="from_path"
                    placeholder="/old-path"
                    required
                  />
                </Stack>
                <Stack gap={1} className="flex-1">
                  <Label htmlFor="to_path">To</Label>
                  <Input id="to_path" name="to_path" placeholder="/new-path" required />
                </Stack>
                <Stack gap={1}>
                  <Label htmlFor="status_code">Status</Label>
                  <Select value={statusCode} onValueChange={setStatusCode}>
                    <SelectTrigger id="status_code" aria-label="HTTP status code">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="301">301 Permanent</SelectItem>
                      <SelectItem value="302">302 Found</SelectItem>
                      <SelectItem value="307">307 Temporary</SelectItem>
                      <SelectItem value="308">308 Permanent (keep method)</SelectItem>
                    </SelectContent>
                  </Select>
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

      <Card variant="module">
        <CardHeader>
          <Heading level={3}>Existing redirects</Heading>
          <CardDescription>
            {rows.length} redirect{rows.length === 1 ? '' : 's'} active.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState
              icon={<Waypoints className="h-5 w-5" />}
              title="No redirects yet"
              description="Use the form above to forward an old URL to a new one. Redirects are returned with the chosen HTTP status code on every storefront hit."
              action={
                <Button
                  type="button"
                  variant="module-outline"
                  size="sm"
                  onClick={() => fromInputRef.current?.focus()}
                >
                  Add your first redirect
                </Button>
              }
            />
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
                      onClick={() => confirmDelete(r)}
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

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove redirect?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono">{pendingDelete?.from_path}</span> will no longer forward
              to <span className="font-mono">{pendingDelete?.to_path}</span>. Any external links to
              the old path will return 404.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete}>Remove redirect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const [skipped, setSkipped] = React.useState<
    { line: number; from_path: string; reason: string }[]
  >([]);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSkipped([]);
    void file.text().then((text) => {
      startTransition(async () => {
        const result = await bulkImportRedirects(text);
        if (fileRef.current) fileRef.current.value = '';
        const imported = result.data?.imported ?? 0;
        const failedList = result.data?.failed ?? [];
        setSkipped(failedList);
        if (!result.ok && imported === 0) {
          onError(result.error ?? 'Bulk import failed.');
          return;
        }
        onDone(
          `Imported ${imported} redirect${imported === 1 ? '' : 's'}` +
            (failedList.length
              ? ` (${failedList.length} row${failedList.length === 1 ? '' : 's'} skipped — see below).`
              : '.')
        );
      });
    });
  }

  return (
    <Card variant="module">
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
              Skipped {skipped.length} {skipped.length === 1 ? 'row' : 'rows'}:
            </Text>
            {skipped.slice(0, 10).map((s) => (
              <Text key={`${s.line}-${s.from_path}`} size="xs" variant="muted">
                Line {s.line} (<code>{s.from_path || '(blank)'}</code>): {s.reason}
              </Text>
            ))}
            {skipped.length > 10 && (
              <Text size="xs" variant="muted">
                …and {skipped.length - 10} more.
              </Text>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
