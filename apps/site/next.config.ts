import type { NextConfig } from 'next';

/** Marketing site: a static export, so it can sit on any CDN and has no server to attack or scale. */
const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@trackrex/ui', '@trackrex/rules', '@trackrex/tokens'],
  reactStrictMode: true,
  poweredByHeader: false,
  webpack(config) {
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'], '.mjs': ['.mts', '.mjs'] };
    return config;
  },
};
export default config;
