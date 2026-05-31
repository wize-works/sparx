// Shared page scaffold for every Email surface: width-constrained container +
// the standard PageHeader (icon, title, optional description/actions). Section
// navigation now lives in the shell's contextual panel (docs/34 §11), so this
// no longer renders an in-content tab strip — each surface just renders its
// own body below the header.

import type { ReactNode } from 'react';
import { Container, PageHeader, Stack } from '@sparx/ui';

interface EmailShellProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Right-aligned header actions (e.g. a "New broadcast" button). */
  actions?: ReactNode;
  children: ReactNode;
}

export function EmailShell({ title, description, icon, actions, children }: EmailShellProps) {
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <PageHeader
          className="mb-0"
          icon={icon}
          title={title}
          description={description}
          actions={actions}
        />
        {children}
      </Stack>
    </Container>
  );
}
