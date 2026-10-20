import { validationFailed } from '#src/lib/errors.js';

/**
 * Zod validation middleware.
 *
 * Validated output lands on `req.valid`, never back on req.body. Zod coerces
 * and strips unknown keys, so the parsed object and the raw one differ — and
 * a handler that reaches for req.body after validation would quietly be using
 * unvalidated input. Separating them makes that mistake impossible.
 *
 * @param {{body?: import('zod').ZodType, query?: import('zod').ZodType, params?: import('zod').ZodType}} schemas
 * @returns {import('express').RequestHandler}
 */
export function validate(schemas) {
  return (req, _res, next) => {
    req.valid = { body: undefined, query: undefined, params: undefined };
    const issues = [];

    for (const part of ['body', 'query', 'params']) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        req.valid[part] = result.data;
      } else {
        issues.push(
          ...result.error.issues.map((i) => ({
            field: [part === 'body' ? null : part, ...i.path].filter(Boolean).join('.'),
            message: i.message,
            code: i.code,
          })),
        );
      }
    }

    if (issues.length) {
      return next(validationFailed('Some of the information provided is not valid.', issues));
    }
    next();
  };
}
