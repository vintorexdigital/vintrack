import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trackrex',
    short_name: 'Trackrex',
    description: 'Track It Easy. Attendance, leave, live field tracking and tasks for office and field teams.',
    start_url: '/',
    display: 'browser',
    background_color: '#FFFFFF',
    theme_color: '#0F5E73',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
