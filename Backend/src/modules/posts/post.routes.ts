import { Router } from 'express';

import { optionalAuth, requireAuth } from '../../middleware/auth';
import { uploadLimiter, writeLimiter } from '../../middleware/rateLimit';
import { uploadImage } from '../../middleware/upload';
import { validate } from '../../middleware/validate';
import { createCommentSchema } from '../comments/comment.schema';
import * as controller from './post.controller';
import { createPostSchema, paginationQuerySchema, postIdParamsSchema } from './post.schema';

export const postRouter = Router();

/**
 * Reads use `optionalAuth`: a signed-in caller gets `viewerHasLiked` and
 * `viewerIsAuthor` resolved, an anonymous one gets the same payload with those
 * flags false, and an expired token degrades to the anonymous view rather than
 * erroring the page.
 */
postRouter.get('/', optionalAuth, validate({ query: paginationQuerySchema }), controller.list);

/**
 * Multipart. `uploadImage` runs before `validate` because multer is what
 * populates `req.body` from the form fields — validating first would see an
 * empty body.
 */
postRouter.post(
  '/',
  requireAuth,
  uploadLimiter,
  uploadImage,
  validate({ body: createPostSchema }),
  controller.create,
);

/**
 * Must be registered before `/:id`. Express matches in declaration order, so
 * with the param route first every request for `/explore` would be handled as
 * `getOne('explore')` and fail validation as a malformed ObjectId — a 400 on a
 * route that looks correctly defined.
 */
postRouter.get(
  '/explore',
  optionalAuth,
  validate({ query: paginationQuerySchema }),
  controller.explore,
);

postRouter.get('/:id', optionalAuth, validate({ params: postIdParamsSchema }), controller.getOne);
postRouter.delete('/:id', requireAuth, validate({ params: postIdParamsSchema }), controller.remove);

postRouter.post(
  '/:id/likes',
  requireAuth,
  writeLimiter,
  validate({ params: postIdParamsSchema }),
  controller.like,
);
postRouter.delete(
  '/:id/likes',
  requireAuth,
  validate({ params: postIdParamsSchema }),
  controller.unlike,
);
postRouter.get('/:id/likes', validate({ params: postIdParamsSchema }), controller.likers);

/**
 * Saving is private, so unlike `/:id/likes` there is no public GET counterpart
 * — the only way to read your saves is `GET /users/me/saved`, which is scoped
 * to the caller by `requireAuth` rather than by a path parameter.
 */
postRouter.post(
  '/:id/save',
  requireAuth,
  writeLimiter,
  validate({ params: postIdParamsSchema }),
  controller.save,
);
postRouter.delete(
  '/:id/save',
  requireAuth,
  validate({ params: postIdParamsSchema }),
  controller.unsave,
);

postRouter.get(
  '/:id/comments',
  optionalAuth,
  validate({ params: postIdParamsSchema, query: paginationQuerySchema }),
  controller.listComments,
);
postRouter.post(
  '/:id/comments',
  requireAuth,
  writeLimiter,
  validate({ params: postIdParamsSchema, body: createCommentSchema }),
  controller.addComment,
);
