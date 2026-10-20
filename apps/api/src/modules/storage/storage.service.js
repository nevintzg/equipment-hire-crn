import { randomUUID } from 'node:crypto';
import { S3Client, DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq } from 'drizzle-orm';
import { db } from '#src/db/client.js';
import { files } from '#src/db/schema/index.js';
import { env } from '#src/config/env.js';
import { badRequest, notFound } from '#src/lib/errors.js';
import { childLogger } from '#src/config/logger.js';

const log = childLogger('storage');

/**
 * File uploads.
 *
 * The browser uploads directly to object storage using a presigned URL; the
 * API only signs the request and records the metadata. Two reasons:
 *
 *   - the API runs on a free tier with limited memory and a request timeout,
 *     and streaming a 10 MB photo of a marquee through it is wasteful;
 *   - bandwidth through the API costs more than bandwidth to the bucket.
 *
 * The signature pins the content type and length, so a presigned URL for a
 * 2 MB JPEG cannot be reused to upload a 500 MB file or an executable.
 */

const ALLOWED = {
  'image/jpeg': { ext: 'jpg', maxBytes: 8 * 1024 * 1024 },
  'image/png': { ext: 'png', maxBytes: 8 * 1024 * 1024 },
  'image/webp': { ext: 'webp', maxBytes: 8 * 1024 * 1024 },
  'image/avif': { ext: 'avif', maxBytes: 8 * 1024 * 1024 },
  'application/pdf': { ext: 'pdf', maxBytes: 20 * 1024 * 1024 },
};

let client = null;
function s3() {
  client ??= new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    // Required by R2 and MinIO, harmless on S3.
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials:
      env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  return client;
}

/**
 * Sign an upload and record the intent.
 *
 * The files row is written now, with uploadedAt null. A row whose uploadedAt
 * is still null an hour later is an abandoned upload, which the tick can
 * clean up — without that record, orphaned objects accumulate invisibly.
 */
export async function createUploadUrl({ org, actor, input }) {
  const rule = ALLOWED[input.mimeType];
  if (!rule) {
    throw badRequest('That file type cannot be uploaded. Use a JPEG, PNG, WebP or PDF.', {
      allowed: Object.keys(ALLOWED),
    });
  }
  if (input.sizeBytes > rule.maxBytes) {
    throw badRequest(
      `That file is too large. The limit is ${Math.round(rule.maxBytes / 1024 / 1024)} MB.`,
    );
  }

  // Key includes the organisation, so one tenant's objects are trivially
  // separable — and a lifecycle rule or a bulk delete can target one tenant.
  const storageKey = `${org.slug}/${input.purpose ?? 'general'}/${randomUUID()}.${rule.ext}`;

  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: storageKey,
      ContentType: input.mimeType,
      ContentLength: input.sizeBytes,
    }),
    { expiresIn: 300 },
  );

  const [row] = await db
    .insert(files)
    .values({
      organisationId: org.id,
      storageKey,
      originalName: input.fileName.slice(0, 200),
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedBy: actor?.userId ?? null,
    })
    .returning();

  return {
    fileId: row.id,
    storageKey,
    uploadUrl: url,
    publicUrl: publicUrlFor(storageKey),
    expiresInSeconds: 300,
    // The browser must send exactly these, or the signature will not match.
    requiredHeaders: { 'Content-Type': input.mimeType },
  };
}

/** Called by the browser once the PUT succeeds. */
export async function confirmUpload({ org, fileId, dimensions }) {
  const [row] = await db
    .update(files)
    .set({
      uploadedAt: new Date(),
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
    })
    .where(and(eq(files.id, fileId), eq(files.organisationId, org.id)))
    .returning();
  if (!row) throw notFound('That upload could not be found.');
  return { ...row, publicUrl: publicUrlFor(row.storageKey) };
}

export const publicUrlFor = (storageKey) =>
  env.S3_PUBLIC_BASE_URL
    ? `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${storageKey}`
    : storageKey;

export async function deleteFile({ org, fileId }) {
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.organisationId, org.id)))
    .limit(1);
  if (!row) throw notFound('That file could not be found.');

  try {
    await s3().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: row.storageKey }));
  } catch (err) {
    // The metadata row is the source of truth for the UI. A failed object
    // delete leaves a harmless orphan, so do not fail the request over it.
    log.warn({ err, storageKey: row.storageKey }, 'Object delete failed; removing record anyway');
  }

  await db.delete(files).where(eq(files.id, fileId));
  return { deleted: true };
}
