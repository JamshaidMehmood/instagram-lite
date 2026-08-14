import { Router } from 'express';

import { requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import * as controller from './auth.controller';
import { googleAuthSchema, loginSchema, signupSchema } from './auth.schema';

export const authRouter = Router();

authRouter.post('/signup', authLimiter, validate({ body: signupSchema }), controller.signup);
authRouter.post('/login', authLimiter, validate({ body: loginSchema }), controller.login);
authRouter.post('/google', authLimiter, validate({ body: googleAuthSchema }), controller.google);
authRouter.post('/refresh', controller.refresh);
authRouter.post('/logout', controller.logout);
authRouter.get('/me', requireAuth, controller.me);
