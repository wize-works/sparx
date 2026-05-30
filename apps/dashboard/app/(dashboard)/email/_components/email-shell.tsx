// Shared page scaffold for every Email surface: page container + header
// (icon, title, optional badge/actions) + the section sub-nav. Keeps the
// chrome identical across Overview / Broadcasts / Automations / etc. so each
// surface only renders its own body.

import type { ReactNode } from 'react';
import { Container, Heading, Stack, Text } from '@sparx/ui';
import { EmailTabs, type EmailSection } from './email-tabs';

interface EmailShellProps {
  current: EmailSection;
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Right-aligned header actions (e.g. a "New broadcast" button). */
  actions?: ReactNode;
  children: ReactNode;
}

export function EmailShell({
  current,
  title,
  description,
  icon,
  actions,
  children,
}: EmailShellProps) {
  return (
    <Container size="xl">
      <Stack gap={6} className="py-10">
        <Stack direction="row" align="start" justify="between" gap={4}>
          <Stack gap={2}>
            <Stack direction="row" align="center" gap={2}>
              {icon ? (
                <span aria-hidden className="text-[var(--module-active)]">
                  {icon}
                </span>
              ) : null}
              <Heading level={1}>{title}</Heading>
            </Stack>
            {description ? <Text variant="muted">{description}</Text> : null}
          </Stack>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </Stack>

        <EmailTabs current={current} />

        {children}
      </Stack>
    </Container>
  );
}
