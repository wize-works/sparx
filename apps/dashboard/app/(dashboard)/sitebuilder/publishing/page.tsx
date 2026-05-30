import { Heading, Text } from '@sparx/ui';
import { getConfig, listSchedules, listVersions } from '../_lib/api';
import { PublishingPanel } from '../_components/publishing-panel';

export default async function PublishingPage() {
  const [config, versions, schedules] = await Promise.all([
    getConfig(),
    listVersions(),
    listSchedules(),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Heading level={1}>Publishing</Heading>
        <Text variant="muted">
          Review version history, roll back, and manage scheduled publishes.
        </Text>
      </div>
      <PublishingPanel
        versions={versions}
        schedules={schedules}
        publishedVersionId={config.publishedVersionId}
      />
    </div>
  );
}
