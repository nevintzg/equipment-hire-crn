import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '#src/config/logger.js';

/**
 * Attaches a request id and a request-scoped logger.
 *
 * Every log line and every error response carries the same id, so a customer
 * saying "it failed at about 3pm, the page said BK-7KQ4M2 / req 8f3c…" is
 * enough to find the exact request in the logs. On a free hosting tier with no
 * APM, that is the whole debugging story.
 */
export const requestContext = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = typeof existing === 'string' && existing.length <= 64 ? existing : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  // Health checks fire every 30 seconds; logging them buries real traffic.
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/ready',
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      // Useful for tenant debugging; not sensitive.
      host: req.headers.host,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
