import { Heading, Text } from '@sparx/ui';
import { listLayout } from '../_lib/api';
import { LayoutEditor } from '../_components/layout-editor';

export default async function NavigationPage() {
  const blocks = await listLayout();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Heading level={1}>Navigation &amp; layout</Heading>
        <Text variant="muted">
          Configure your header, footer, and announcement bar. Publish from Design or Homepage to go
          live.
        </Text>
      </div>
      <LayoutEditor blocks={blocks} />
    </div>
  );
}
