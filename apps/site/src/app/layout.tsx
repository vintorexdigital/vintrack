import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { BRAND_TAGLINE } from '@trackrex/ui';
import './globals.css';
import { SiteFooter, SiteHeader } from '../components/chrome';
import { SITE_URL } from '../content/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `Trackrex: ${BRAND_TAGLINE}. Attendance, leave and field operations`, template: '%s · Trackrex' },
  description: `${BRAND_TAGLINE}. Attendance, leave, live field tracking and tasks for teams that work in offices and on the road. Rules enforced on the server, privacy by design.`,
  openGraph: { type: 'website', siteName: 'Trackrex' },
};
// Zoom is never blocked.
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

const ORG = { '@context': 'https://schema.org', '@type': 'Organization', name: 'Vintorex', url: SITE_URL, brand: { '@type': 'Brand', name: 'Trackrex', slogan: BRAND_TAGLINE, logo: `${SITE_URL}/brand/icon-512.png` } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded-button focus:bg-brand focus:px-3 focus:py-2 focus:text-on-brand">Skip to content</a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG) }} />
      </body>
    </html>
  );
}
