import { Router } from 'express';

import * as controller from './media.controller';

export const mediaRouter = Router();

/**
 * Read-only by design. There is no standalone upload endpoint because an
 * upload that is not immediately attached to a post leaves an orphaned GridFS
 * file behind whenever a user abandons the compose screen. Bytes enter the
 * system only through `POST /api/v1/posts`, which stores the image and the
 * post together and rolls the image back if the post insert fails.
 */
mediaRouter.get('/:id', controller.serve);
