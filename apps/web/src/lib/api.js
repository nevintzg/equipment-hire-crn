import { createApiClient } from '@equipment-hire/client';

const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export const api = createApiClient({ app: 'web', baseUrl: `${base}/api/v1` });
