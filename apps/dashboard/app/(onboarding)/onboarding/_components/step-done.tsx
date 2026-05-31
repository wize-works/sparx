'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button, Card, Heading, Stack, Text } from '@sparx/ui';
import { ArrowRight, ExternalLink, PartyPopper } from 'lucide-react';

const STORE_ZONE = 'sparx.zone';

// Terminal screen. Onboarding is already marked finished server-side (the
// payments step's finish action) — this is purely a celebratory handoff into
// the dashboard + the day-0 checklist at /welcome.
export function StepDone({ slug }: { slug: string }) {
  const storeUrl = slug ? `https://${slug}.${STORE_ZONE}` : null;

  return (
    <Stack gap={8} className="py-6">
      <Stack gap={3} align="center" className="text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--module-active-tint)]">
          <PartyPopper className="h-7 w-7 text-[var(--module-active)]" />
        </span>
        <Heading level={1}>You&apos;re live</Heading>
        <Text variant="muted">
          Your store is set up and your storefront is published. Here&apos;s where to go next.
        </Text>
        {storeUrl && (
          <Button color="primary" variant="link" asChild>
            <a href={storeUrl} target="_blank" rel="noreferrer">
              {slug}.{STORE_ZONE}
              <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </Button>
        )}
      </Stack>

      <Stack gap={3}>
        <NextCard
          href="/sitebuilder/design"
          title="Customize your storefront"
          description="Fine-tune colors, fonts, and homepage sections in Site Builder."
        />
        <NextCard
          href="/commerce/products"
          title="Build out your catalog"
          description="Add pricing, variants, media, and more products."
        />
        <NextCard
          href="/welcome"
          title="Finish the setup checklist"
          description="A few day-one tasks to get production-ready."
        />
      </Stack>

      <Stack direction="row" justify="center">
        <Button color="module" asChild rightIcon={<ArrowRight className="h-4 w-4" />}>
          <Link href="/">Go to dashboard</Link>
        </Button>
      </Stack>
    </Stack>
  );
}

function NextCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <Card padding="md" className="hover:border-[var(--module-active)]">
        <Stack direction="row" align="center" justify="between" gap={3}>
          <Stack gap={1}>
            <Text weight="medium">{title}</Text>
            <Text size="sm" variant="muted">
              {description}
            </Text>
          </Stack>
          <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-text-tertiary)]" />
        </Stack>
      </Card>
    </Link>
  );
}
