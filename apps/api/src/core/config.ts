import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  /** Owner role: migrations only. */
  DATABASE_URL: z.string().default('postgres://postgres:postgres@127.0.0.1:54329/trackrex'),
  /** Company-scoped API role (RLS enforced). */
  DATABASE_APP_URL: z.string().default('postgres://trackrex_app:trackrex_app@127.0.0.1:54329/trackrex'),
  /** Platform console role: platform schema only. */
  DATABASE_PLATFORM_URL: z.string().default('postgres://trackrex_platform:trackrex_platform@127.0.0.1:54329/trackrex'),
  /** Worker role: bypasses RLS, used only by apps/worker. */
  DATABASE_WORKER_URL: z.string().default('postgres://trackrex_worker:trackrex_worker@127.0.0.1:54329/trackrex'),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  JWT_COMPANY_SECRET: z.string().min(16).default('dev-company-secret-change-me-please'),
  JWT_PLATFORM_SECRET: z.string().min(16).default('dev-platform-secret-change-me-please'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  PRIMARY_DOMAIN: z.string().default('trackrex.test'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  PLATFORM_ORIGIN: z.string().default('http://localhost:3001'),
  /** Outbound email, for example smtp://user:pass@smtp.example.com:587. Without it, messages are only logged. */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Trackrex <no-reply@trackrex.test>'),
  /** Where uploaded files are kept when using local-disk storage. */
  FILES_DIR: z.string().default('./var/files'),
  /** Delivery for SMS, WhatsApp and push. 'mock' (the default) delivers nothing and only records the message. */
  SMS_PROVIDER: z.enum(['mock', 'twilio']).default('mock'),
  WHATSAPP_PROVIDER: z.enum(['mock', 'twilio']).default('mock'),
  PUSH_PROVIDER: z.enum(['mock', 'expo']).default('mock'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_SMS_FROM: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** 'disk' keeps files under FILES_DIR (single host). 's3' uses any S3-compatible store, so the API can run on many hosts. */
  STORAGE_DRIVER: z.enum(['disk', 's3']).default('disk'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('ap-south-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PATH_STYLE: bool.default(true),
  /** Seal location data and selfies with per-company data keys. Turning it off only stops sealing new data; sealed data stays readable. */
  ENVELOPE_ENCRYPTION: bool.default(true),
  /** Master keys for wrapping company data keys: id:base64(32 bytes), comma separated, first is current. Development default is public: set your own in production. */
  KMS_MASTER_KEYS: z.string().default('dev-1:ZGV2LW1hc3Rlci1rZXktbm90LXNlY3JldC0zMi1ieXQ='),
  /** Let workflow webhooks call private and non-https addresses. For development and tests only. */
  WORKFLOW_WEBHOOK_ALLOW_PRIVATE: bool.default(false),
  /** Extra browser origins allowed by CORS, comma separated (for example the mobile app's web build during development). */
  CORS_EXTRA_ORIGINS: z.string().default(''),
  /** Returns OTP codes in responses and logs them. Never enable in production. */
  AUTH_DEV_OTP_ECHO: bool.default(false),
  /** Bypass the platform IP allowlist when the allowlist is empty (dev only). */
  PLATFORM_ALLOW_ANY_IP_WHEN_EMPTY: bool.default(true),
  GOOGLE_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  /** Which gateway collects invoice payments. 'manual' means bank transfer recorded by finance. */
  BILLING_PROVIDER: z.enum(['manual', 'razorpay', 'stripe']).default('manual'),
  BILLING_SELLER_NAME: z.string().default('Vintorex'),
  BILLING_SELLER_GSTIN: z.string().optional(),
  BILLING_SELLER_ADDRESS: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env === process.env && cached) return cached;
  const parsed = schema.parse(env);
  if (parsed.NODE_ENV === 'production') {
    if (parsed.JWT_COMPANY_SECRET.startsWith('dev-') || parsed.JWT_PLATFORM_SECRET.startsWith('dev-')) {
      throw new Error('Set JWT_COMPANY_SECRET and JWT_PLATFORM_SECRET in production.');
    }
    if (parsed.KMS_MASTER_KEYS.startsWith('dev-1:')) throw new Error('Set KMS_MASTER_KEYS in production.');
    if (parsed.WORKFLOW_WEBHOOK_ALLOW_PRIVATE) throw new Error('WORKFLOW_WEBHOOK_ALLOW_PRIVATE must be false in production.');
    if (parsed.AUTH_DEV_OTP_ECHO) throw new Error('AUTH_DEV_OTP_ECHO must be false in production.');
  }
  if (parsed.STORAGE_DRIVER === 's3' && !(parsed.S3_ENDPOINT && parsed.S3_BUCKET && parsed.S3_ACCESS_KEY_ID && parsed.S3_SECRET_ACCESS_KEY)) {
    throw new Error('STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.');
  }
  if ((parsed.SMS_PROVIDER === 'twilio' || parsed.WHATSAPP_PROVIDER === 'twilio') && !(parsed.TWILIO_ACCOUNT_SID && parsed.TWILIO_AUTH_TOKEN)) {
    throw new Error('Using Twilio needs TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
  }
  if (env === process.env) cached = parsed;
  return parsed;
}

export const CONFIG = Symbol('CONFIG');
