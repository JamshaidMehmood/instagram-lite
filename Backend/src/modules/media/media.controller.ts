import { ObjectId } from 'mongodb';

import { logger } from '../../config/logger';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import * as mediaService from './media.service';

/**
 * Serves image bytes.
 *
 * Deliberately unauthenticated: the frontend renders these through `<img
 * src>`, which cannot carry an Authorization header. Access control rests on
 * the ObjectId being unguessable, which is the same posture a signed CDN URL
 * takes. Anything genuinely private would need a signed, expiring URL instead.
 */
export const serve = asyncHandler(async (req, res) => {
  const id = req.params['id'] ?? '';
  if (!ObjectId.isValid(id)) throw ApiError.notFound('Image');

  const objectId = new ObjectId(id);
  const file = await mediaService.findImage(objectId);
  if (!file) throw ApiError.notFound('Image');

  // Content at a given id never changes, so the id *is* a perfect ETag and the
  // response can be cached forever. Repeat views cost a 304 at most.
  const etag = `"${String(file.id)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Length', String(file.length));
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  // helmet defaults CORP to `same-origin`, which would make the browser refuse
  // to paint these in the SPA running on another origin.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  const stream = mediaService.openImageStream(objectId);

  stream.on('error', (error: unknown) => {
    logger.error({ err: error, mediaId: id }, 'Media stream failed');
    // Headers are already on the wire by this point, so the only honest signal
    // left is to tear down the connection.
    res.destroy();
  });

  stream.pipe(res);
});
