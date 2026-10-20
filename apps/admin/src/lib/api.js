import { createApiClient } from '@equipment-hire/client';

const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/** Admin audience: separate cookie, separate token, staff-only routes. */
export const api = createApiClient({ app: 'admin', baseUrl: `${base}/api/v1` });
