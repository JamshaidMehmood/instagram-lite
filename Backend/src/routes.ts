import { Router } from 'express';

import { authRouter } from './modules/auth/auth.routes';
import { commentRouter } from './modules/comments/comment.routes';
import { mediaRouter } from './modules/media/media.routes';
import { notificationRouter } from './modules/notifications/notification.routes';
import { postRouter } from './modules/posts/post.routes';
import { userRouter } from './modules/users/user.routes';

/**
 * Everything is mounted under a version prefix so a future breaking change can
 * ship as `/api/v2` while existing clients keep working.
 */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/posts', postRouter);
apiRouter.use('/comments', commentRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/media', mediaRouter);
