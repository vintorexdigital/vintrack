/**
 * Creates a platform operator. Usage (password from the environment, never from the command line):
 *   STAFF_PASSWORD=... node dist/create-staff.js ops@example.com "Ops Person" super_admin
 * Two-factor enrolment is forced at first sign-in. Roles: super_admin, support, finance, onboarding, analyst.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { PlatformAuthService } from './modules/platform/platform-auth.service.js';

const [email, name, role = 'support'] = process.argv.slice(2);
const password = process.env.STAFF_PASSWORD;
if (!email || !name || !password || password.length < 12) {
  console.error('Usage: STAFF_PASSWORD=<at least 12 characters> node dist/create-staff.js <email> "<name>" [role]');
  process.exit(2);
}
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
const staff = await app.get(PlatformAuthService).createStaff({ email, name, role: role as 'support', password });
console.log(`Created ${staff.role} ${staff.email}. They enrol two-factor at first sign-in.`);
await app.close();
process.exit(0);
