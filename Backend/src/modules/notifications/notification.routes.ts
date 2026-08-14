import { Router } from 'express';

import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { paginationQuerySchema } from '../posts/post.schema';
import * as controller from './notification.controller';

export const notificationRouter = Router();

/**
 * Every route here is `requireAuth`, never `optionalAuth`.
 *
 * The rest of the API personalises a response that also exists for a guest; a
 * notification list has no anonymous form at all — it is defined entirely by
 * who the recipient is, and it is other people's activity aimed at one account.
 * There is nothing to degrade to.
 */

/**
 * Must stay above any `/:id` route added here later. Express matches in
 * declaration order rather than by specificity, so a param route declared first
 * would swallow "unread-count" and the badge would break in whatever way that
 * handler fails.
 */
notificationRouter.get('/unread-count', requireAuth, controller.unreadCount);

notificationRouter.get(
  '/',
  requireAuth,
  validate({ query: paginationQuerySchema }),
  controller.list,
);

/**
 * POST, not PATCH: this addresses no single notification. It is "I have seen
 * the tab", which is an action on the whole inbox, and it is idempotent — a
 * second call finds nothing left unread. 204 because the client already knows
 * the resulting count is zero and has nothing to render from a body.
 */
notificationRouter.post('/read', requireAuth, controller.markRead);
