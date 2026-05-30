import type { Metadata } from 'next';
import { ConfirmProvider, THEME_INIT_SCRIPT, Toaster, TooltipProvider } from '@sparx/ui';
import { PostHogProvider } from '../components/posthog-provider';
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
        <PostHogProvider>
          <TooltipProvider delayDuration={150}>
            <ConfirmProvider>{children}</ConfirmProvider>
          </TooltipProvider>
          <Toaster />
        </PostHogProvider>
      </body>
    </html>
  );
}
