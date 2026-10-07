import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { CoreModule } from './core/core.module.js';
import { loadConfig } from './core/config.js';
import { JobsModule } from './jobs/jobs.module.js';
import { JOB_NAMES, JobsService, type JobName } from './jobs/jobs.service.js';

@Module({ imports: [CoreModule, JobsModule] })
class WorkerModule {}

/** Cron-like schedules; BullMQ repeatables survive restarts and are de-duplicated across replicas. */
export const SCHEDULE: Record<JobName, { every: number }> = {
  'outbox-relay': { every: 5_000 },
  'auto-punch-out': { every: 5 * 60_000 },
  'finalize-days': { every: 60 * 60_000 },
  'maintain-partitions': { every: 24 * 3_600_000 },
  'purge-recycle-bins': { every: 24 * 3_600_000 },
  'expire-trials': { every: 60 * 60_000 },
  'purge-location-history': { every: 24 * 3_600_000 },
  'generate-invoices': { every: 6 * 3_600_000 },
  'run-dunning': { every: 6 * 3_600_000 },
  'seal-legacy-locations': { every: 60 * 60_000 },
  'rewrap-keys': { every: 24 * 3_600_000 },
};

const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['error', 'warn', 'log'] });
const jobs = app.get(JobsService);
const connection = new Redis(loadConfig().REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue('trackrex', { connection });

for (const name of JOB_NAMES) {
  await queue.upsertJobScheduler(name, { every: SCHEDULE[name].every }, { name, opts: { removeOnComplete: 50, removeOnFail: 200, attempts: 2 } });
}
const worker = new Worker('trackrex', async (job) => jobs.run(job.name as JobName), { connection, concurrency: 2 });
worker.on('failed', (job, err) => console.error(`job ${job?.name} failed: ${err.message}`));
console.log(`worker ready: ${JOB_NAMES.join(', ')}`);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await worker.close();
    await queue.close();
    await app.close();
    connection.disconnect();
    process.exit(0);
  });
}
