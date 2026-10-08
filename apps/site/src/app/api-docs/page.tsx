import type { Metadata } from 'next';
import spec from '../../../../../docs/openapi.json';
import { ApiExplorer, type Endpoint } from '../../components/api-explorer';
import { Section } from '../../components/chrome';

export const metadata: Metadata = { title: 'API reference', description: 'Every Trackrex REST endpoint, generated from the OpenAPI document.' };

interface Op { summary?: string; tags?: string[] }
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export default function ApiDocs() {
  const endpoints: Endpoint[] = [];
  for (const [path, item] of Object.entries((spec as { paths: Record<string, Record<string, Op>> }).paths)) {
    for (const m of METHODS) {
      const op = item[m];
      if (op) endpoints.push({ method: m.toUpperCase(), path, summary: op.summary ?? '', tag: op.tags?.[0] ?? '' });
    }
  }
  endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return (
    <Section title="API reference" intro="Generated from the same OpenAPI document the server is tested against. Authenticate with a Bearer token; errors use RFC 9457 problem details.">
      <ApiExplorer endpoints={endpoints} />
    </Section>
  );
}
