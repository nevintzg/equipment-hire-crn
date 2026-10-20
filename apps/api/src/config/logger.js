import { pino } from 'pino';
import { env, isDevelopment, isTest } from './env.js';

/**
 * One logger for the whole process.
 *
 * `redact` is the important part: request bodies and headers routinely carry
 * passwords, tokens and Stripe signatures, and logs tend to end up in places
 * with wider access than the database.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'eqhire-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-cron-secret"]',
      'req.headers["stripe-signature"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.secret',
      '*.cardNumber',
      'body.password',
      'body.currentPassword',
      'body.newPassword',
    ],
    censor: '[redacted]',
  },
  // Pretty output locally, single-line JSON everywhere else so that log
  // aggregators can parse it.
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service' },
      }
    : undefined,
});

/**
 * Child logger for a named subsystem.
 * @param {string} name
 */
export const childLogger = (name) => logger.child({ module: name });
