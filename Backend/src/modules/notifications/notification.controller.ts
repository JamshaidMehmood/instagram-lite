import { asyncHandler } from '../../utils/asyncHandler';
import { requireUser, validatedQuery } from '../../utils/request';
import type { PaginationQuery } from '../posts/post.schema';
import * as notificationService from './notification.service';

export const list = asyncHandler(async (req, res) => {
  const query = validatedQuery<PaginationQuery>(req);
  const page = await notificationService.listForUser(requireUser(req).id, query);

  res
    .status(200)
    .json({ data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore } });
});

export const unreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.unreadCount(requireUser(req).id);
  // Wrapped in an object rather than returned as a bare number so the response
  // can gain a field later without breaking every client parsing it.
  res.status(200).json({ data: { count } });
});

export const markRead = asyncHandler(async (req, res) => {
  await notificationService.markAllRead(requireUser(req).id);
  res.status(204).send();
});
