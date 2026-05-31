import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Container,
  EmptyState,
  Grid,
  Heading,
  Stack,
  Text,
} from '@sparx/ui';
import { Sparkles } from 'lucide-react';

export interface ModuleStubProps {
  icon: React.ReactNode;
  title: string;
  tagline: string;
  description: string;
  features: { title: string; description: string }[];
}

// Shared scaffolding for module landing pages while their real UI is unbuilt.
// Each page wraps this in <ModuleProvider module="..."> so the badge, card
// stripes, and link color all pick up the module's accent automatically.
export function ModuleStub({ icon, title, tagline, description, features }: ModuleStubProps) {
  return (
    <Container size="xl">
      <Stack gap={8} className="py-10">
        <Stack gap={2}>
          <Stack direction="row" align="center" gap={2}>
            <span aria-hidden className="text-[var(--module-active)]">
              {icon}
            </span>
            <Heading level={1}>{title}</Heading>
            <Badge color="module">Module preview</Badge>
          </Stack>
          <Text variant="muted">{tagline}</Text>
        </Stack>

        <EmptyState
          icon={<Sparkles className="h-5 w-5" />}
          title={`${title} is coming online`}
          description={description}
        />

        <Stack gap={3}>
          <Heading level={3}>What ships in this module</Heading>
          <Grid cols={1} mdCols={2} lgCols={3} gap={4}>
            {features.map((f) => (
              <Card key={f.title} variant="module">
                <CardHeader>
                  <CardDescription>Planned</CardDescription>
                  <CardTitle>{f.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Text size="sm" variant="muted">
                    {f.description}
                  </Text>
                </CardContent>
              </Card>
            ))}
          </Grid>
        </Stack>
      </Stack>
    </Container>
  );
}
