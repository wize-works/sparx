import type { Metadata } from 'next';
import { Toaster, TooltipProvider } from '@sparx/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sparx Dashboard',
  description: 'Merchant admin for the Sparx commerce platform.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
        {/* Mounted at the root so toast() from any island (CMS restore, AI
            assistant, etc.) actually surfaces without each surface having to
            remount its own toaster. */}
        <Toaster />
      </body>
    </html>
  );
}
