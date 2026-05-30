import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { EmptyState } from '@sparx/ui';

// Placeholder body for Email surfaces whose full UI lands in a later delivery
// phase. Keeps the section nav functional (no 404s) between phased deploys.
export function EmailComingSoon({ title, description }: { title: string; description: ReactNode }) {
  return (
    <EmptyState icon={<Sparkles className="h-5 w-5" />} title={title} description={description} />
  );
}
