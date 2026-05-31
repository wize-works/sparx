'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
  Textarea,
  toast,
} from '@sparx/ui';

import { addSuppressionAction, importSuppressionsAction } from '../actions';

export function AddSuppressionForm() {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState('');
  const [scope, setScope] = useState('all');

  function parseEmails(raw: string): string[] {
    return raw
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const emails = parseEmails(value);
    if (emails.length === 0) {
      toast.error('Enter at least one email address.');
      return;
    }

    startTransition(async () => {
      if (emails.length === 1) {
        const result = await addSuppressionAction({ email: emails[0], scope, reason: 'manual' });
        if (result.ok) {
          toast.success(`${emails[0]} suppressed.`);
          setValue('');
        } else {
          toast.error(result.error.message);
        }
      } else {
        const result = await importSuppressionsAction({ emails, scope, reason: 'manual' });
        if (result.ok) {
          toast.success(
            `${result.data.added} address${result.data.added === 1 ? '' : 'es'} suppressed.`
          );
          setValue('');
        } else {
          toast.error(result.error.message);
        }
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={3} className="max-w-2xl">
        <Stack gap={2}>
          <Label htmlFor="emails">Email addresses</Label>
          <Textarea
            id="emails"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="one@example.com, two@example.com — or one per line"
            rows={3}
            disabled={pending}
          />
          <Text size="sm" variant="muted">
            Paste one or many addresses (comma, space, or newline separated).
          </Text>
        </Stack>
        <Stack direction="row" align="end" gap={3}>
          <Stack gap={2}>
            <Label htmlFor="scope">Scope</Label>
            <Select value={scope} onValueChange={setScope} disabled={pending}>
              <SelectTrigger id="scope" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All email</SelectItem>
                <SelectItem value="marketing">Marketing only</SelectItem>
                <SelectItem value="transactional">Transactional only</SelectItem>
              </SelectContent>
            </Select>
          </Stack>
          <Button type="submit" color="module" loading={pending} disabled={pending}>
            <Plus className="h-4 w-4" />
            Suppress
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}
