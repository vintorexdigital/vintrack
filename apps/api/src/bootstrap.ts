import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { requestContext } from './core/http/request-context.js';
import { loadConfig } from './core/config.js';

export async function createApp(opts: { logger?: boolean } = {}): Promise<NestExpressApplication> {
  const cfg = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: opts.logger === false ? false : ['error', 'warn', 'log'], bodyParser: true, rawBody: true });
  app.set('trust proxy', 1);
  app.set('query parser', 'extended');
  app.use(helmet());
  app.use(cookieParser());
  app.use(requestContext);
  app.setGlobalPrefix('v1', { exclude: ['health', 'platform/v1/(.*)'] });
  app.enableCors({
    origin: [cfg.WEB_ORIGIN, cfg.PLATFORM_ORIGIN, new RegExp(`^https://[a-z0-9-]+\\.app\\.${cfg.PRIMARY_DOMAIN.replace(/\./g, '\\.')}$`)],
    credentials: true,
    exposedHeaders: ['x-request-id', 'content-disposition', 'idempotent-replay'],
  });
  app.enableShutdownHooks();
  return app;
}
