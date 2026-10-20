import { z } from 'zod';

export const uploadUrlSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(3).max(100),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(25 * 1024 * 1024),
  purpose: z
    .enum(['equipment', 'branding', 'inspection', 'category', 'general'])
    .default('general'),
});

export const confirmUploadSchema = z.object({
  width: z.number().int().min(1).max(20_000).optional(),
  height: z.number().int().min(1).max(20_000).optional(),
});
