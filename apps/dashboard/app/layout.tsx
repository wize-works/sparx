import type { Metadata } from 'next';
import { ConfirmProvider, THEME_INIT_SCRIPT, Toaster, TooltipProvider } from '@sparx/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sparx Dashboard',
  description: 'Merchant admin for the Sparx commerce platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Runs before React hydrates, so the persisted theme is applied
            to <html> before paint — no FOUC. See @sparx/ui/use-theme. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <TooltipProvider delayDuration={150}>
          {/* ConfirmProvider mounts one shared AlertDialog at the root so
              `useConfirm()` from any island works without a per-component
              dialog. Replaces the old `window.confirm(...)` calls scattered
              across the dashboard with a Sparx-styled, accessible dialog. */}
          <ConfirmProvider>{children}</ConfirmProvider>
        </TooltipProvider>
        {/* Mounted at the root so toast() from any island (CMS restore, AI
            assistant, etc.) actually surfaces without each surface having to
            remount its own toaster. */}
        <Toaster />
      </body>
    </html>
  );
}
