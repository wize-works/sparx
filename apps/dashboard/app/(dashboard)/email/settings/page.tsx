import { Settings as SettingsIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sparx/ui';

import { api } from '@/lib/api-rest-client';
import { EmailShell } from '../_components/email-shell';
import { SettingsForm } from './settings-form';
import type { EmailSettingsView } from '../_lib/types';

export const dynamic = 'force-dynamic';

export default async function EmailSettingsPage() {
  const settings = await api.get<EmailSettingsView>('/v1/email/settings');

  return (
    <EmailShell
      current="settings"
      icon={<SettingsIcon className="h-5 w-5" />}
      title="Settings"
      description="Sender identity, reply-to, physical address, and brand defaults."
    >
      <Card>
        <CardHeader>
          <CardTitle>Sender &amp; branding</CardTitle>
          <CardDescription>
            These defaults apply to every transactional and marketing email unless a specific
            template or broadcast overrides them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm initial={settings} />
        </CardContent>
      </Card>
    </EmailShell>
  );
}
