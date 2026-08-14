import { Router } from 'express';

import { optionalAuth, requireAuth } from '../../middleware/auth';
import { uploadLimiter, writeLimiter } from '../../middleware/rateLimit';
import { uploadImage } from '../../middleware/upload';
import { validate } from '../../middleware/validate';
import { paginationQuerySchema, usernameParamsSchema } from '../posts/post.schema';
import * as controller from './user.controller';
import { searchQuerySchema, updateProfileSchema } from './user.schema';

export const userRouter = Router();

/**
 * Everything down to the `/:username` block must stay above it.
 *
 * Express matches in declaration order, not by specificity, and "suggestions",
 * "search" and "me" all satisfy the username rules — so with `/:username`
 * first none of these would ever run and each would 404 with "User not found".
 * Any literal segment added here later has the same constraint.
 */
userRouter.get('/suggestions', optionalAuth, controller.suggestions);

/**
 * `optionalAuth`, not `requireAuth`: an anonymous caller gets the same results
 * with `viewerIsFollowing` false, which is what keeps search usable on a
 * logged-out page instead of turning it into a second sign-in wall.
 */
userRouter.get('/search', optionalAuth, validate({ query: searchQuerySchema }), controller.search);

/**
 * The `/me` routes address the caller through their token rather than taking a
 * user id in the path. There is no id to tamper with, so no endpoint here can
 * be pointed at somebody else's account.
 */
userRouter.patch(
  '/me',
  requireAuth,
  validate({ body: updateProfileSchema }),
  controller.updateProfile,
);

/**
 * Multipart, so `uploadImage` runs before the handler for the same reason it
 * does on post creation — multer is what populates `req.file`. PUT rather than
 * POST: uploading twice leaves exactly one avatar, not two.
 */
userRouter.put('/me/avatar', requireAuth, uploadLimiter, uploadImage, controller.uploadAvatar);

userRouter.delete('/me/avatar', requireAuth, controller.removeAvatar);

userRouter.get(
  '/me/saved',
  requireAuth,
  validate({ query: paginationQuerySchema }),
  controller.listSaved,
);

/**
 * Profiles are addressed by username, not by email.
 *
 * The old app routed to `/profile/:email`, which published every user's email
 * address in a shareable URL and in the browser history of anyone who visited.
 */
userRouter.get(
  '/:username',
  optionalAuth,
  validate({ params: usernameParamsSchema }),
  controller.getProfile,
);

userRouter.get(
  '/:username/posts',
  optionalAuth,
  validate({ params: usernameParamsSchema, query: paginationQuerySchema }),
  controller.listPosts,
);

/**
 * Follow and unfollow are both idempotent, so the verb carries the intent and
 * repeating a call is harmless — the client never has to know the current
 * state to issue the right request.
 */
userRouter.post(
  '/:username/follow',
  requireAuth,
  writeLimiter,
  validate({ params: usernameParamsSchema }),
  controller.follow,
);

userRouter.delete(
  '/:username/follow',
  requireAuth,
  writeLimiter,
  validate({ params: usernameParamsSchema }),
  controller.unfollow,
);

userRouter.get(
  '/:username/followers',
  optionalAuth,
  validate({ params: usernameParamsSchema, query: paginationQuerySchema }),
  controller.listFollowers,
);

userRouter.get(
  '/:username/following',
  optionalAuth,
  validate({ params: usernameParamsSchema, query: paginationQuerySchema }),
  controller.listFollowing,
);
