import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { createApp } from '../src/bootstrap.js';
import { buildOpenApi } from '../src/core/http/openapi.js';

const app = await createApp({ logger: false });
await app.init();
const doc = buildOpenApi(app);
writeFileSync(new URL('../../../docs/openapi.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`openapi: ${Object.keys(doc.paths as object).length} paths`);
await app.close();
