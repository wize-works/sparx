import { Card, CardContent, CardHeader, CardTitle, Container, PageHeader, Stack } from '@sparx/ui';

import { AuthoredForm } from '../_components/authored-form';

export default function NewTemplatePage() {
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <PageHeader title="New marketing template" />

        <Card>
          <CardHeader>
            <CardTitle>Compose</CardTitle>
          </CardHeader>
          <CardContent>
            <AuthoredForm />
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
