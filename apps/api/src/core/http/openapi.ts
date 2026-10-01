import type { INestApplication } from '@nestjs/common';
import { z } from 'zod';
import { RESOURCES } from '../../shared/crud/crud.factory.js';

interface Layer { route?: { path: string; methods: Record<string, boolean> }; name?: string; handle?: { stack?: Layer[] }; matchers?: unknown }

const schemaOf = (s: z.ZodType): unknown => {
  try {
    return z.toJSONSchema(s, { unrepresentable: 'any', io: 'input' });
  } catch {
    return {};
  }
};

const PROBLEM = { $ref: '#/components/schemas/Problem' };
const err = (description: string) => ({ description, content: { 'application/problem+json': { schema: PROBLEM } } });

const listParams = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
  { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'From the previous page\'s nextCursor.' },
  { name: 'include_total', in: 'query', schema: { type: 'boolean' }, description: 'Count all matches (slower).' },
  { name: 'sort', in: 'query', schema: { type: 'string' }, description: 'For example -createdAt,name.' },
  { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Free-text search.' },
  { name: 'deleted', in: 'query', schema: { enum: ['exclude', 'include', 'only'] } },
  { name: 'filter[field][op]', in: 'query', schema: { type: 'string' }, description: 'Operators: eq, ne, in, nin, gt, gte, lt, lte, between, contains, empty.' },
];

/** Express routes as OpenAPI paths. CRUD resources carry full request schemas; custom routes list path and method. */
export function buildOpenApi(app: INestApplication): Record<string, unknown> {
  const http = app.getHttpAdapter().getInstance() as { router?: { stack: Layer[] }; _router?: { stack: Layer[] } };
  const stack = http.router?.stack ?? http._router?.stack ?? [];
  const paths: Record<string, Record<string, unknown>> = {};
  const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z]+)/g, '{$1}');

  for (const layer of stack) {
    if (!layer.route) continue;
    const path = toOpenApiPath(layer.route.path);
    for (const method of Object.keys(layer.route.methods)) {
      if (method === '_all' || method === 'head' || method === 'options') continue;
      const params = [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
      (paths[path] ??= {})[method] = {
        summary: `${method.toUpperCase()} ${path}`,
        security: path.startsWith('/platform/') ? [{ platformToken: [] }] : path.includes('/auth/') || path === '/health' ? [] : [{ companyToken: [] }],
        ...(params.length ? { parameters: params } : {}),
        responses: { '200': { description: 'Success' }, '401': err('Not signed in'), '403': err('Not allowed'), '422': err('Validation failed') },
      };
    }
  }

  for (const { kit, apiPath } of RESOURCES) {
    const base = `/v1/${apiPath}`;
    const tag = kit.def.plural;
    const read = { $ref: `#/components/schemas/${kit.def.key}` };
    const op = (summary: string, extra: Record<string, unknown> = {}) => ({ summary, tags: [tag], security: [{ companyToken: [] }], responses: { '200': { description: 'Success', content: { 'application/json': { schema: read } } }, '401': err('Not signed in'), '403': err('Permission or data scope denies this'), '404': err('Not found'), '409': err('Conflict'), '422': err('Validation failed') }, ...extra });
    (paths[base] ??= {}).get = op(`List ${tag.toLowerCase()}`, { parameters: listParams, 'x-permission': kit.permissions.read, 'x-filterable': Object.keys(kit.filterable) });
    paths[base]!.post = op(`Create ${kit.def.singular.toLowerCase()}`, { requestBody: { required: true, content: { 'application/json': { schema: schemaOf(kit.createSchema) } } }, 'x-permission': kit.permissions.create });
    (paths[`${base}/{id}`] ??= {}).get = op(`Get ${kit.def.singular.toLowerCase()}`, { 'x-permission': kit.permissions.read });
    paths[`${base}/{id}`]!.patch = op(`Update ${kit.def.singular.toLowerCase()}`, { requestBody: { required: true, content: { 'application/json': { schema: schemaOf(kit.updateSchema) } } }, 'x-permission': kit.permissions.update });
    paths[`${base}/{id}`]!.delete = op(`Delete ${kit.def.singular.toLowerCase()} to the recycle bin`, { 'x-permission': kit.permissions.delete });
  }

  const schemas: Record<string, unknown> = {
    Problem: { type: 'object', required: ['type', 'title', 'status', 'code'], properties: { type: { type: 'string' }, title: { type: 'string' }, status: { type: 'integer' }, code: { type: 'string' }, detail: { type: 'string' }, requestId: { type: 'string' }, errors: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } } } } } },
  };
  for (const { kit } of RESOURCES) schemas[kit.def.key] = schemaOf(kit.readSchema);

  return {
    openapi: '3.1.0',
    info: { title: 'Trackrex API', version: '1.0.0', description: 'Company API under /v1, platform console API under /platform/v1. Errors are RFC 9457 problem details with a stable `code`.' },
    servers: [{ url: 'https://api.trackrex.app' }],
    paths,
    components: {
      schemas,
      securitySchemes: {
        companyToken: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Company realm access token, or an API key.' },
        platformToken: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Platform realm token. Never valid on /v1.' },
      },
    },
  };
}
