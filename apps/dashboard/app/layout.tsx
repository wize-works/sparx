import type { Metadata } from 'next';
import { TooltipProvider } from '@sparx/ui';
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
      </body>
    </html>
  );
}
