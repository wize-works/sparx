import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Container,
  Heading,
  Stack,
} from '@sparx/ui';

import { AuthoredForm } from '../_components/authored-form';

export default function NewTemplatePage() {
  return (
    <Container size="lg">
      <Stack gap={6} className="py-10">
        <Button variant="link" size="sm" asChild>
          <Link href="/email/templates">
            <ArrowLeft className="h-3.5 w-3.5" />
            Templates
          </Link>
        </Button>
        <Heading level={1}>New marketing template</Heading>

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
