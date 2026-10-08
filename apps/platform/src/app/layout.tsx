import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { PlatformProviders } from '@/shared/session';

export const metadata: Metadata = { title: { default: 'Trackrex Platform', template: '%s · Trackrex Platform' }, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-button focus:bg-brand focus:px-3 focus:py-2 focus:text-on-brand">Skip to content</a>
        <PlatformProviders>{children}</PlatformProviders>
      </body>
    </html>
  );
}
