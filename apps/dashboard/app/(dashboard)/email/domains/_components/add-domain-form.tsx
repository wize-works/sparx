'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Text,
  toast,
} from '@sparx/ui';

import { createDomainAction } from '../actions';

export function AddDomainForm() {
  const [pending, startTransition] = useTransition();
  const [domain, setDomain] = useState('');
  const [region, setRegion] = useState('us');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createDomainAction({ domain: domain.trim(), region });
      if (result.ok) {
        toast.success(`${result.data.domain} added — publish the DNS records, then verify.`);
        setDomain('');
      } else {
        setError(result.error.message);
        toast.error(result.error.message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit}>
      <Stack direction="row" align="end" gap={3} className="flex-wrap">
        <Stack gap={2} className="min-w-64 flex-1">
          <Label htmlFor="domain">Domain</Label>
          <Input
            id="domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="mail.yourstore.com"
            disabled={pending}
            autoComplete="off"
          />
        </Stack>
        <Stack gap={2}>
          <Label htmlFor="region">Region</Label>
          <Select value={region} onValueChange={setRegion} disabled={pending}>
            <SelectTrigger id="region" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="us">US</SelectItem>
              <SelectItem value="eu">EU</SelectItem>
            </SelectContent>
          </Select>
        </Stack>
        <Button type="submit" color="module" loading={pending} disabled={pending || !domain.trim()}>
          <Plus className="h-4 w-4" />
          Add domain
        </Button>
      </Stack>
      {error ? (
        <Text size="sm" variant="danger" className="mt-2">
          {error}
        </Text>
      ) : null}
    </form>
  );
}
