import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ALL_KITS } from '@trackrex/schemas';
import { buildOpenApi } from '../src/core/http/openapi.js';
import { boot, type Harness } from './harness.js';

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });

describe('OpenAPI contract', () => {
  it('describes every CRUD resource with the same schemas the server validates with', () => {
    const doc = buildOpenApi(h.app) as { openapi: string; paths: Record<string, Record<string, { requestBody?: { content: { 'application/json': { schema: { properties?: Record<string, unknown> } } } } }>>; components: { schemas: Record<string, unknown> } };
    expect(doc.openapi).toBe('3.1.0');
    for (const kit of ALL_KITS) {
      const base = `/v1${kit.def.path}`;
      const post = doc.paths[base]?.post;
      expect(post, `${base} POST`).toBeTruthy();
      const props = Object.keys(post!.requestBody!.content['application/json'].schema.properties ?? {});
      expect(props.sort()).toEqual(Object.keys((z.toJSONSchema(kit.createSchema, { unrepresentable: 'any', io: 'input' }) as { properties: object }).properties).sort());
      expect(doc.paths[`${base}/{id}`]?.patch, `${base}/{id} PATCH`).toBeTruthy();
      expect(doc.components.schemas[kit.def.key]).toBeTruthy();
    }
    expect(Object.keys(doc.paths).length).toBeGreaterThan(80);
    expect(doc.paths['/platform/v1/tenants']).toBeTruthy();
    expect(doc.paths['/v1/attendance/punches']?.post).toBeTruthy();
  });
});
