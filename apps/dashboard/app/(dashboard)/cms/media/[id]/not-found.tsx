// Friendly not-found for media assets. Without this, Next.js falls through
// to the framework default 404 chrome with no Sparx nav (audit F-34). Keeping
// the user inside the CMS subtree so they can back out to the media library
// with one click.

import Link from 'next/link';
import { Button, Card, CardContent, Container, EmptyState, Stack } from '@sparx/ui';
import { ImageOff } from 'lucide-react';
import { CmsTabs } from '../../_components/cms-tabs';

export default function NotFound() {
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="media" />
        <Card variant="module">
          <CardContent>
            <EmptyState
              icon={<ImageOff className="h-5 w-5" />}
              title="Asset not found"
              description="This media asset doesn't exist, was deleted, or belongs to a different tenant. Head back to the library to find what you need."
              action={
                <Button asChild variant="module">
                  <Link href="/cms/media">Back to media library</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
