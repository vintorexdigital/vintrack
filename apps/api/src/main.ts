import { createApp } from './bootstrap.js';
import { loadConfig } from './core/config.js';

const app = await createApp();
await app.listen(loadConfig().PORT, '0.0.0.0');
