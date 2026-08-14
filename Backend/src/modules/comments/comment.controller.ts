import { asyncHandler } from '../../utils/asyncHandler';
import { requireUser, validatedParams } from '../../utils/request';
import * as commentService from './comment.service';

export const remove = asyncHandler(async (req, res) => {
  const { commentId } = validatedParams<{ commentId: string }>(req);
  await commentService.deleteComment(commentId, requireUser(req).id);
  res.status(204).send();
});
