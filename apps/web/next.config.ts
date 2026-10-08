import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@trackrex/ui', '@trackrex/schemas', '@trackrex/rules', '@trackrex/tokens'],
  reactStrictMode: true,
  poweredByHeader: false,
  webpack(config) {
    // Workspace packages import their own TypeScript files with .js specifiers (NodeNext style).
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'], '.mjs': ['.mts', '.mjs'] };
    return config;
  },
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
      ],
    }];
  },
};
export default config;
