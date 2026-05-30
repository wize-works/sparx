// Webhook subscriptions UI — placeholder.
//
// The audit (cms-audit-2026-05-29.md F-05) found that the CMS sub-nav linked
// merchants straight into a 500 because no page.tsx existed. The audit's
// fix-A was "ship a minimal placeholder", which is what this is — the full
// CRUD UI on top of /v1/webhooks/subscriptions is tracked as Phase 5+ work
// in project_cms_phase5_deferred.md. Removing the sidebar tab was option B
// and was rejected: webhooks are a real surface, just not built out yet.
//
// Until the editor lands, this page tells merchants that webhooks exist,
// what they're for, and how to manage them via the API.

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Container,
  EmptyState,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';
import { Webhook } from 'lucide-react';
import { CmsTabs } from '../_components/cms-tabs';

export const dynamic = 'force-dynamic';

export default function WebhooksPage() {
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <CmsTabs current="webhooks" />
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <Webhook className="h-5 w-5" />
            <Heading level={1}>Webhooks</Heading>
            <Badge variant="outline">coming soon</Badge>
          </Stack>
          <Text variant="muted">
            Subscribe an external endpoint to <code>content.*</code> events so a publish in Sparx
            triggers a downstream rebuild, cache purge, or notification. Backend wiring is live —
            the dashboard editor lands in a follow-up.
          </Text>
        </Stack>

        <Card variant="module">
          <CardContent>
            <EmptyState
              icon={<Webhook className="h-5 w-5" />}
              title="Webhook editor is on the roadmap"
              description="Until the UI ships, configure subscriptions via the API: POST /v1/webhooks/subscriptions with a target URL, the events you care about, and an HMAC signing secret. Deliveries are logged with retry state."
              action={
                <Button asChild variant="module-outline">
                  <a href="https://docs.sparx.works/api/webhooks" target="_blank" rel="noreferrer">
                    Read the webhook API docs
                  </a>
                </Button>
              }
            />
          </CardContent>
        </Card>

        <Card variant="module">
          <CardHeader>
            <Heading level={3}>Events you can subscribe to</Heading>
            <CardDescription>
              Every state-changing CMS mutation fans out to Pub/Sub and (when subscribed) to your
              endpoint with an HMAC-SHA256 signature in the <code>X-Sparx-Signature</code> header.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap={1}>
              <Text size="sm">
                <code>content.entry.created</code> · new entry inserted
              </Text>
              <Text size="sm">
                <code>content.entry.updated</code> · entry body / SEO patched (autosave or save)
              </Text>
              <Text size="sm">
                <code>content.entry.published</code> · entry flipped to <code>published</code>
              </Text>
              <Text size="sm">
                <code>content.entry.scheduled</code> · entry scheduled for future publish
              </Text>
              <Text size="sm">
                <code>content.entry.unpublished</code> · entry reverted to <code>draft</code>
              </Text>
              <Text size="sm">
                <code>content.entry.deleted</code> · soft delete
              </Text>
              <Text size="sm">
                <code>content_type.upserted</code> · custom content type schema saved
              </Text>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
