import { GridFSBucket, ObjectId } from 'mongodb';

import { getDb } from '../../config/db';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/ApiError';
import { readImageInfo, type ImageInfo } from '../../utils/imageDimensions';

export const MEDIA_BUCKET = 'media';

let bucket: GridFSBucket | null = null;

/**
 * GridFS splits a file across a `media.chunks` collection and keeps metadata
 * in `media.files`. That is what lets a post document hold a 12-byte ObjectId
 * instead of a multi-megabyte base64 string, and it keeps the binary inside
 * MongoDB — no filesystem to lose on a serverless cold start, and no second
 * service to provision.
 */
export function getBucket(): GridFSBucket {
  bucket ??= new GridFSBucket(getDb(), { bucketName: MEDIA_BUCKET, chunkSizeBytes: 255 * 1024 });
  return bucket;
}

export interface StoredImage {
  id: ObjectId;
  info: ImageInfo;
}

export async function storeImage(
  buffer: Buffer,
  filename: string,
  ownerId: string,
): Promise<StoredImage> {
  // Authoritative format check: parsed from the bytes, ignoring whatever
  // Content-Type the client claimed.
  const info = readImageInfo(buffer);
  if (!info) {
    throw ApiError.unsupportedMediaType('That file is not a valid JPEG, PNG, WebP or GIF image');
  }

  const uploadStream = getBucket().openUploadStream(filename, {
    contentType: info.contentType,
    metadata: { ownerId, width: info.width, height: info.height, uploadedAt: new Date() },
  });

  await new Promise<void>((resolve, reject) => {
    uploadStream.once('error', reject);
    uploadStream.once('finish', () => resolve());
    uploadStream.end(buffer);
  });

  return { id: uploadStream.id, info };
}

export interface MediaFile {
  id: ObjectId;
  length: number;
  contentType: string;
}

export async function findImage(id: ObjectId): Promise<MediaFile | null> {
  const [file] = await getBucket().find({ _id: id }, { limit: 1 }).toArray();
  if (!file) return null;

  return {
    id: file._id,
    length: file.length,
    contentType: file.contentType ?? 'application/octet-stream',
  };
}

export function openImageStream(id: ObjectId): NodeJS.ReadableStream {
  return getBucket().openDownloadStream(id);
}

/**
 * Best-effort cleanup. A post delete should not fail because its image was
 * already gone, so a missing file is logged and swallowed.
 */
export async function deleteImage(id: ObjectId): Promise<void> {
  try {
    await getBucket().delete(id);
  } catch (error) {
    logger.warn({ err: error, mediaId: String(id) }, 'Could not delete media file');
  }
}

/** The path the frontend puts in an `<img src>`. */
export function mediaUrl(id: ObjectId | string): string {
  return `/api/v1/media/${String(id)}`;
}
