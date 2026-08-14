import { Router } from 'express';

import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as controller from './comment.controller';
import { commentIdParamsSchema } from './comment.schema';

export const commentRouter = Router();

/**
 * Listing and creating comments live under `/posts/:id/comments` because they
 * are scoped to a post. Deleting one is addressed by its own id, so it sits at
 * the top level.
 */
commentRouter.delete(
  '/:commentId',
  requireAuth,
  validate({ params: commentIdParamsSchema }),
  controller.remove,
);
