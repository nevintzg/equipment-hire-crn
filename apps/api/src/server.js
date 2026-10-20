import { createServer } from 'node:http';
import { createApp } from '#src/app.js';
import { env, isProduction } from '#src/config/env.js';
import { logger } from '#src/config/logger.js';
import { closeDatabase, pingDatabase } from '#src/db/client.js';
import { isMain } from '#src/lib/is-main.js';

/**
 * Process bootstrap.
 *
 * The shutdown sequence matters on a host that stops instances routinely:
 * stop accepting new connections, let in-flight requests finish, then close
 * the database pool. Exiting immediately would abandon a transaction
 * mid-booking.
 */
async function start() {
  if (env.SENTRY_DSN) {
    // Imported only when configured, so the SDK is not loaded in development.
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: 0.1,
      // Error reports must not carry customer details.
      sendDefaultPii: false,
    });
    logger.info('Sentry initialised');
  }

  const app = createApp();
  const server = createServer(app);

  // Longer than the host's own 30s proxy timeout, so a slow cold start is cut
  // off by the proxy with a clear 504 rather than by us mid-response.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  await new Promise((resolve) => server.listen(env.PORT, resolve));
  const { port } = server.address();
  logger.info({ port, environment: env.NODE_ENV }, 'API listening');

  // Warm the pool, but never block startup on it: a sleeping database would
  // otherwise stop the instance from becoming healthy at all.
  pingDatabase()
    .then(() => logger.info('Database reachable'))
    .catch((err) => logger.warn({ err }, 'Database not reachable at startup'));

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    // Force-exit guard: if a request hangs, the platform will kill us anyway,
    // and a clean-ish exit beats a SIGKILL mid-write.
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; exiting');
      process.exit(1);
    }, 15_000);
    forceExit.unref();

    server.close(async () => {
      await closeDatabase();
      logger.info('Shutdown complete');
      clearTimeout(forceExit);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // An unhandled rejection leaves the process in an unknown state. In
  // production, exiting lets the platform restart a clean instance; in
  // development, staying up keeps the stack trace on screen.
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    if (isProduction) shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  return server;
}

if (isMain(import.meta.url)) {
  start().catch((err) => {
    logger.fatal({ err }, 'Failed to start');
    console.error(err);
    process.exit(1);
  });
}

export { start };
