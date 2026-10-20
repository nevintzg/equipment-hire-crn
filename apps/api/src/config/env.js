import { z } from 'zod';

/**
 * Environment validation.
 *
 * Reading process.env directly anywhere else in the codebase is a bug: a typo
 * in a variable name would silently become `undefined` and surface as a
 * mysterious runtime failure days later. Everything goes through this schema,
 * which runs once at import time and crashes the process with a readable list
 * of problems if anything is wrong.
 */

const bool = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', ''])])
  .transform((v) => v === true || v === 'true' || v === '1')
  .default(false);

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(0).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    // Database
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_URL_DIRECT: z.string().optional(),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),

    // Public URLs
    PUBLIC_WEB_URL: z.url().default('http://localhost:5173'),
    PUBLIC_ADMIN_URL: z.url().default('http://localhost:5174'),
    PUBLIC_API_URL: z.url().default('http://localhost:4000'),
    EXTRA_CORS_ORIGINS: csv,

    // Tenancy
    DEFAULT_ORG_SLUG: z.string().min(1).default('demo'),

    // Auth
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL_MIN: z.coerce.number().int().min(1).max(120).default(15),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    COOKIE_DOMAIN: z.string().optional(),
    ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

    // Email
    EMAIL_PROVIDER: z.enum(['log', 'smtp', 'resend']).default('log'),
    EMAIL_FROM: z.string().min(3).default('Equipment Hire <no-reply@localhost>'),
    EMAIL_REPLY_TO: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().optional(),
    SMTP_SECURE: bool,
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),

    // Stripe
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),

    // Storage
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().default('auto'),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_BASE_URL: z.string().optional(),

    // Scheduled tick
    CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters'),

    // Observability
    SENTRY_DSN: z.string().optional(),

    // Seed
    SEED_OWNER_EMAIL: z.string().optional(),
    SEED_OWNER_PASSWORD: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.EMAIL_PROVIDER === 'smtp' && !v.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when EMAIL_PROVIDER=smtp',
      });
    }
    if (v.EMAIL_PROVIDER === 'resend' && !v.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      });
    }

    if (v.NODE_ENV !== 'production') return;

    // Guards that only matter once real customer data is involved.
    if (v.EMAIL_PROVIDER === 'log') {
      ctx.addIssue({
        code: 'custom',
        path: ['EMAIL_PROVIDER'],
        message: 'EMAIL_PROVIDER=log would silently drop every email in production',
      });
    }
    if (v.JWT_SECRET.includes('dev-only') || v.JWT_SECRET.includes('replace-me')) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET still holds its placeholder value',
      });
    }
    if (/^0+$/.test(v.ENCRYPTION_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['ENCRYPTION_KEY'],
        message: 'ENCRYPTION_KEY still holds its placeholder value',
      });
    }
    if (v.STRIPE_SECRET_KEY.startsWith('sk_test')) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: 'Production is configured with a Stripe test key',
      });
    }
    for (const key of ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL']) {
      if (!v[key]) {
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required in production` });
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`);
  // Logger is not available yet — this must not depend on anything.
  console.error(`\nInvalid environment configuration:\n${lines.join('\n')}\n`);
  console.error('Copy .env.example to .env and fill in the missing values.\n');
  process.exit(1);
}

/** @typedef {z.infer<typeof schema>} Env */

/** @type {Env} */
export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';

/** Unpooled URL for migrations; falls back to the pooled one locally. */
export const directDatabaseUrl = env.DATABASE_URL_DIRECT || env.DATABASE_URL;

/** Origins allowed to make credentialed cross-site requests. */
export const allowedOrigins = [
  env.PUBLIC_WEB_URL,
  env.PUBLIC_ADMIN_URL,
  ...env.EXTRA_CORS_ORIGINS,
].map((u) => u.replace(/\/$/, ''));
