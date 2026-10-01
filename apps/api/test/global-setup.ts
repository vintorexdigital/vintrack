import pg from 'pg';
import { migrate } from '../src/core/database/migrator.js';

const ADMIN = 'postgres://postgres:postgres@127.0.0.1:54329/postgres';
export const TEST_DB_URL = 'postgres://postgres:postgres@127.0.0.1:54329/trackrex_test';

/** Fresh database per run, migrated from scratch so every run also proves the migrations apply. */
export default async function setup(): Promise<void> {
  const c = new pg.Client({ connectionString: ADMIN });
  await c.connect();
  await c.query('drop database if exists trackrex_test with (force)');
  await c.query('create database trackrex_test');
  await c.end();
  await migrate(TEST_DB_URL, 'up');
}
