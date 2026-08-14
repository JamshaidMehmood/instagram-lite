import multer from 'multer';

import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Memory storage, not disk: the bytes go straight into GridFS, so writing them
 * to a temp file first would only add I/O and a cleanup path to get wrong. It
 * also means nothing is written to a filesystem that a serverless host is free
 * to discard between invocations.
 *
 * `fileSize` is enforced by multer while streaming, so an oversized upload is
 * aborted mid-flight rather than after buffering the whole thing.
 */
export const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_BYTES,
    files: 1,
    // Caps the non-file form fields alongside the image.
    fields: 10,
  },
  fileFilter: (_req, file, callback) => {
    // A cheap first pass only — the declared type is client-controlled, so the
    // authoritative check is the magic-byte parse in `readImageInfo`.
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      callback(ApiError.unsupportedMediaType('Only JPEG, PNG, WebP and GIF images are supported'));
      return;
    }
    callback(null, true);
  },
}).single('image');
