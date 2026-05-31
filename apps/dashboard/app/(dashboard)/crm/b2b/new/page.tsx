'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';

import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Container,
  Input,
  Label,
  PageHeader,
  Stack,
  Text,
  Textarea,
} from '@sparx/ui';

import { createB2bAccountAction } from '../../b2b-actions';

interface EngineProfileDraft {
  id: string;
  make: string;
  model: string;
  year: string;
  engine: string;
  count: string;
}

function makeEmptyProfile(): EngineProfileDraft {
  return {
    id: Math.random().toString(36).slice(2),
    make: '',
    model: '',
    year: '',
    engine: '',
    count: '',
  };
}

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]';

export default function NewB2bAccountPage() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [engineProfiles, setEngineProfiles] = React.useState<EngineProfileDraft[]>([]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const input = {
      companyName: nonEmpty(form.get('companyName')),
      taxId: nonEmpty(form.get('taxId')),
      website: nonEmpty(form.get('website')),
      pricingTier: nonEmpty(form.get('pricingTier')),
      creditLimit: numOrZero(form.get('creditLimit')),
      discountPercent: numOrZero(form.get('discountPercent')),
      status: nonEmpty(form.get('status')) ?? 'active',
      paymentTerms: nonEmpty(form.get('paymentTerms')),
      fleetSize: form.get('fleetSize') ? Number(form.get('fleetSize')) : undefined,
      notes: nonEmpty(form.get('notes')),
      tags: parseTags(form.get('tags')),
      engineProfiles: engineProfiles
        .filter((p) => p.make.trim() && p.model.trim())
        .map((p) => ({
          make: p.make.trim(),
          model: p.model.trim(),
          ...(p.year.trim() ? { year: Number(p.year) } : {}),
          ...(p.engine.trim() ? { engine: p.engine.trim() } : {}),
          ...(p.count.trim() ? { count: Number(p.count) } : {}),
        })),
    };

    startTransition(async () => {
      const result = await createB2bAccountAction(input);
      if (result.ok) {
        router.push(`/crm/b2b/${result.data.id}`);
        router.refresh();
        return;
      }
      setError(result.error.message);
    });
  }

  return (
    <Container size="md">
      <Stack gap={6} className="py-10">
        <PageHeader
          title="New B2B account"
          description={
            <>
              Track a wholesale or fleet customer&apos;s pricing, credit, and engine profile so
              commerce modules can quote, ship, and invoice them consistently.
            </>
          }
        />

        <form onSubmit={onSubmit} noValidate>
          <Card>
            <CardHeader>
              <CardTitle>Account details</CardTitle>
            </CardHeader>
            <CardContent>
              <Stack gap={4}>
                <Stack gap={2}>
                  <Label htmlFor="companyName">Company name</Label>
                  <Input id="companyName" name="companyName" required />
                </Stack>
                <Stack direction="row" gap={4}>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="taxId">Tax ID</Label>
                    <Input id="taxId" name="taxId" />
                  </Stack>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      name="website"
                      type="url"
                      placeholder="https://example.com"
                    />
                  </Stack>
                </Stack>
                <Stack direction="row" gap={4}>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="pricingTier">Pricing tier</Label>
                    <Input
                      id="pricingTier"
                      name="pricingTier"
                      placeholder="bronze, silver, gold…"
                    />
                  </Stack>
                  <Stack gap={2} className="w-40">
                    <Label htmlFor="status">Status</Label>
                    <select
                      id="status"
                      name="status"
                      defaultValue="active"
                      className={SELECT_CLASS}
                    >
                      <option value="active">Active</option>
                      <option value="credit_hold">Credit hold</option>
                      <option value="suspended">Suspended</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </Stack>
                </Stack>
                <Stack direction="row" gap={4}>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="creditLimit">Credit limit</Label>
                    <Input
                      id="creditLimit"
                      name="creditLimit"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={0}
                    />
                  </Stack>
                  <Stack gap={2} className="w-40">
                    <Label htmlFor="discountPercent">Discount %</Label>
                    <Input
                      id="discountPercent"
                      name="discountPercent"
                      type="number"
                      min="0"
                      max="100"
                      defaultValue={0}
                    />
                  </Stack>
                  <Stack gap={2} className="flex-1">
                    <Label htmlFor="paymentTerms">Payment terms</Label>
                    <select
                      id="paymentTerms"
                      name="paymentTerms"
                      defaultValue=""
                      className={SELECT_CLASS}
                    >
                      <option value="">(unspecified)</option>
                      <option value="prepay">Prepay</option>
                      <option value="net15">Net 15</option>
                      <option value="net30">Net 30</option>
                      <option value="net60">Net 60</option>
                      <option value="net90">Net 90</option>
                    </select>
                  </Stack>
                  <Stack gap={2} className="w-32">
                    <Label htmlFor="fleetSize">Fleet size</Label>
                    <Input id="fleetSize" name="fleetSize" type="number" min="0" />
                  </Stack>
                </Stack>
                <Stack gap={2}>
                  <Label htmlFor="tags">Tags</Label>
                  <Input id="tags" name="tags" placeholder="fleet, vip, midwest" />
                  <Text size="xs" variant="muted">
                    Comma-separated. Used by segments and reports.
                  </Text>
                </Stack>

                <Stack gap={2}>
                  <Stack direction="row" align="center" justify="between">
                    <Label>Engine profiles</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      leftIcon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => setEngineProfiles((prev) => [...prev, makeEmptyProfile()])}
                    >
                      Add engine
                    </Button>
                  </Stack>
                  {engineProfiles.length === 0 ? (
                    <Text size="xs" variant="muted">
                      One row per engine variant the fleet runs. Drives fitment-aware catalog
                      filtering once Commerce lands. Optional.
                    </Text>
                  ) : (
                    <Stack gap={2}>
                      {engineProfiles.map((profile, index) => (
                        <Stack
                          key={profile.id}
                          direction="row"
                          gap={2}
                          align="end"
                          className="rounded-md border border-[var(--color-border-default)] p-2"
                        >
                          <Stack gap={1} className="w-20">
                            {index === 0 && <Label className="text-xs">Year</Label>}
                            <Input
                              type="number"
                              min="1900"
                              max="2100"
                              value={profile.year}
                              onChange={(e) =>
                                setEngineProfiles((prev) =>
                                  prev.map((p) =>
                                    p.id === profile.id ? { ...p, year: e.target.value } : p
                                  )
                                )
                              }
                            />
                          </Stack>
                          <Stack gap={1} className="flex-1">
                            {index === 0 && <Label className="text-xs">Make</Label>}
                            <Input
                              value={profile.make}
                              placeholder="Cummins"
                              onChange={(e) =>
                                setEngineProfiles((prev) =>
                                  prev.map((p) =>
                                    p.id === profile.id ? { ...p, make: e.target.value } : p
                                  )
                                )
                              }
                            />
                          </Stack>
                          <Stack gap={1} className="flex-1">
                            {index === 0 && <Label className="text-xs">Model</Label>}
                            <Input
                              value={profile.model}
                              placeholder="ISX15"
                              onChange={(e) =>
                                setEngineProfiles((prev) =>
                                  prev.map((p) =>
                                    p.id === profile.id ? { ...p, model: e.target.value } : p
                                  )
                                )
                              }
                            />
                          </Stack>
                          <Stack gap={1} className="flex-1">
                            {index === 0 && <Label className="text-xs">Engine code</Label>}
                            <Input
                              value={profile.engine}
                              placeholder="optional"
                              onChange={(e) =>
                                setEngineProfiles((prev) =>
                                  prev.map((p) =>
                                    p.id === profile.id ? { ...p, engine: e.target.value } : p
                                  )
                                )
                              }
                            />
                          </Stack>
                          <Stack gap={1} className="w-20">
                            {index === 0 && <Label className="text-xs">Count</Label>}
                            <Input
                              type="number"
                              min="0"
                              value={profile.count}
                              onChange={(e) =>
                                setEngineProfiles((prev) =>
                                  prev.map((p) =>
                                    p.id === profile.id ? { ...p, count: e.target.value } : p
                                  )
                                )
                              }
                            />
                          </Stack>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label="Remove engine profile"
                            onClick={() =>
                              setEngineProfiles((prev) => prev.filter((p) => p.id !== profile.id))
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Stack>

                <Stack gap={2}>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" rows={4} />
                </Stack>

                {error && (
                  <Text size="sm" variant="danger" role="alert" aria-live="polite">
                    {error}
                  </Text>
                )}
              </Stack>
            </CardContent>
            <CardFooter>
              <Button variant="ghost" asChild>
                <Link href="/crm/b2b">Cancel</Link>
              </Button>
              <Button type="submit" color="module" disabled={pending} loading={pending}>
                Create B2B account
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Stack>
    </Container>
  );
}

function nonEmpty(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function numOrZero(value: FormDataEntryValue | null): number {
  const s = typeof value === 'string' ? value.trim() : '';
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseTags(value: FormDataEntryValue | null): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const tags = value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return tags.length > 0 ? tags : undefined;
}
