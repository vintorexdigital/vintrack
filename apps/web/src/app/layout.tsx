import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { BRAND_TAGLINE } from '@trackrex/ui';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: `Trackrex · ${BRAND_TAGLINE}`, template: '%s · Trackrex' },
  description: `${BRAND_TAGLINE}. Workforce operations for field and office teams.`,
};

// Zoom is never blocked: no user-scalable=no and no maximum-scale below 5.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-button focus:bg-brand focus:px-3 focus:py-2 focus:text-on-brand">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
