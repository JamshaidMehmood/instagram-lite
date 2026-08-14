import { Types } from 'mongoose';

import { ApiError } from './ApiError';

/**
 * Cursor (keyset) pagination rather than skip/limit.
 *
 * `skip` degrades linearly — the server walks and discards every skipped
 * document — and it double-serves or drops rows when items are inserted while
 * a client is paging, which is exactly what an append-heavy feed does. Keying
 * off `(createdAt, _id)` is O(index seek) at any depth and stable under
 * concurrent writes. `_id` breaks ties so identical timestamps cannot make the
 * cursor stall.
 */
export interface Cursor {
  createdAt: Date;
  id: Types.ObjectId;
}

export function encodeCursor(createdAt: Date, id: Types.ObjectId | string): string {
  return Buffer.from(`${createdAt.toISOString()}|${String(id)}`).toString('base64url');
}

export function decodeCursor(cursor: string): Cursor {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const separator = decoded.lastIndexOf('|');
  if (separator === -1) throw ApiError.badRequest('Malformed cursor');

  const timestamp = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  const createdAt = new Date(timestamp);

  if (Number.isNaN(createdAt.getTime()) || !Types.ObjectId.isValid(id)) {
    throw ApiError.badRequest('Malformed cursor');
  }

  return { createdAt, id: new Types.ObjectId(id) };
}

/**
 * Newest-first keyset predicate: everything strictly older than the cursor.
 */
export function buildCursorFilter(cursor: Cursor) {
  return {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ],
  };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Callers fetch `limit + 1` rows; the extra row proves another page exists
 * without a second count query.
 */
export function buildPage<T extends { createdAt: Date; _id: Types.ObjectId }>(
  rows: T[],
  limit: number,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last._id) : null,
  };
}
