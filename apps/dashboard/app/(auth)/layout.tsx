import { Container, Stack, Text } from '@sparx/ui';
import Link from 'next/link';

// Auth pages sit outside the (dashboard) route group so they don't pick up
// the Sidebar + topbar chrome. A simple centered layout with the wordmark.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg-subtle)]">
      <header className="flex items-center justify-between border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-6 py-4">
        <Link href="/" className="font-medium tracking-tight">
          <span>Spar</span>
          <span className="text-[var(--color-primary)]">x</span>
        </Link>
        <Text size="sm" variant="muted">
          Sparx
        </Text>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <Container size="sm">
          <Stack gap={6}>{children}</Stack>
        </Container>
      </main>
    </div>
  );
}
