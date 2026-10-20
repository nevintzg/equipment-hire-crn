import { Router } from 'express';
import { validate } from '#src/middleware/validate.js';
import { authenticate } from '#src/middleware/auth.js';
import { authLimiter } from '#src/middleware/rate-limit.js';
import { requireTrustedOrigin } from '#src/middleware/origin-check.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './auth.schemas.js';
import * as service from './auth.service.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './cookies.js';

/**
 * Auth routes, mounted twice — once for the customer site and once for the
 * admin panel — with the `app` parameter deciding which audience the tokens
 * are minted for. Same code, separate credentials, no way to cross over.
 *
 * @param {'web'|'admin'} app
 */
export function createAuthRouter(app) {
  const router = Router();

  if (app === 'web') {
    router.post('/register', authLimiter, validate({ body: registerSchema }), async (req, res) => {
      const result = await service.register({ org: req.org, input: req.valid.body, req });

      // A duplicate email returns 202 with no tokens: the response must not
      // reveal whether the address was already registered.
      if (!result.created) {
        return res.status(202).json({
          data: { message: 'Check your email to continue setting up your account.' },
        });
      }

      setRefreshCookie(res, 'web', result.tokens.refreshToken);
      res.status(201).json({
        data: {
          user: service.toPublicUser(result.user),
          accessToken: result.tokens.accessToken,
          expiresIn: result.tokens.expiresIn,
        },
      });
    });
  }

  router.post('/login', authLimiter, validate({ body: loginSchema }), async (req, res) => {
    const { user, tokens } = await service.login({
      org: req.org,
      app,
      input: req.valid.body,
      req,
    });
    setRefreshCookie(res, app, tokens.refreshToken);
    res.json({
      data: {
        user: service.toPublicUser(user),
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
        permissions: tokens.permissions,
      },
    });
  });

  // Reads the refresh cookie, so it needs the CSRF origin check.
  router.post('/refresh', requireTrustedOrigin, async (req, res) => {
    const { user, tokens } = await service.refresh({
      org: req.org,
      app,
      refreshToken: readRefreshCookie(req, app),
      req,
    });
    setRefreshCookie(res, app, tokens.refreshToken);
    res.json({
      data: {
        user: service.toPublicUser(user),
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
        permissions: tokens.permissions,
      },
    });
  });

  router.post('/logout', requireTrustedOrigin, async (req, res) => {
    await service.logout({ app, refreshToken: readRefreshCookie(req, app) });
    clearRefreshCookie(res, app);
    res.status(204).end();
  });

  router.post(
    '/forgot-password',
    authLimiter,
    validate({ body: forgotPasswordSchema }),
    async (req, res) => {
      await service.forgotPassword({ org: req.org, email: req.valid.body.email });
      // Always the same answer, whether or not the account exists.
      res.json({ data: { message: 'If that email is registered, a reset link is on its way.' } });
    },
  );

  router.post(
    '/reset-password',
    authLimiter,
    validate({ body: resetPasswordSchema }),
    async (req, res) => {
      await service.resetPassword(req.valid.body);
      res.json({ data: { message: 'Your password has been changed. Please sign in.' } });
    },
  );

  router.post('/verify-email', validate({ body: verifyEmailSchema }), async (req, res) => {
    await service.verifyEmail(req.valid.body);
    res.json({ data: { message: 'Thanks — your email address is confirmed.' } });
  });

  router.post('/resend-verification', authenticate(app), authLimiter, async (req, res) => {
    const result = await service.resendVerification({ org: req.org, user: req.auth.user });
    res.json({ data: result });
  });

  router.post(
    '/change-password',
    authenticate(app),
    authLimiter,
    validate({ body: changePasswordSchema }),
    async (req, res) => {
      await service.changePassword({
        user: req.auth.user,
        currentPassword: req.valid.body.currentPassword,
        newPassword: req.valid.body.newPassword,
        keepSessionId: req.auth.sessionId,
      });
      res.json({ data: { message: 'Your password has been changed.' } });
    },
  );

  return router;
}
