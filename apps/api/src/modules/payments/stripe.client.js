import Stripe from 'stripe';
import { env } from '#src/config/env.js';
import { decrypt } from '#src/lib/crypto.js';

/**
 * Stripe clients.
 *
 * One shared client for the platform key, plus per-organisation clients when
 * an organisation has supplied its own keys — which is what lets each
 * community group take money into its own account rather than into a shared
 * pot that then has to be reconciled by hand.
 *
 * maxNetworkRetries is set because the API runs on a host that sleeps: the
 * first outbound call after a cold start is the one most likely to be slow.
 */
const OPTIONS = {
  apiVersion: '2025-09-30.clover',
  maxNetworkRetries: 2,
  timeout: 20_000,
  appInfo: { name: 'Community Equipment Hire', version: '0.1.0' },
};

const platform = new Stripe(env.STRIPE_SECRET_KEY, OPTIONS);
const byOrg = new Map();

/**
 * @param {{id: string, stripeSecretKeyEnc?: string|null}} [org]
 */
export function stripeFor(org) {
  if (!org?.stripeSecretKeyEnc) return platform;
  let client = byOrg.get(org.id);
  if (!client) {
    client = new Stripe(decrypt(org.stripeSecretKeyEnc), OPTIONS);
    byOrg.set(org.id, client);
  }
  return client;
}

/** Webhook signing secret for this organisation, or the platform's. */
export const webhookSecretFor = (org) =>
  org?.stripeWebhookSecretEnc ? decrypt(org.stripeWebhookSecretEnc) : env.STRIPE_WEBHOOK_SECRET;

export { platform as stripe };
