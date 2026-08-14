import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireUser, validatedBody, validatedParams, validatedQuery } from '../../utils/request';
import * as commentService from '../comments/comment.service';
import type { CreateCommentInput } from '../comments/comment.schema';
import * as postService from './post.service';
import type { CreatePostInput, PaginationQuery } from './post.schema';

export const list = asyncHandler(async (req, res) => {
  const query = validatedQuery<PaginationQuery>(req);
  const page = await postService.listFeed(query, req.user?.id);
  res.status(200).json({ data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore } });
});

export const explore = asyncHandler(async (req, res) => {
  const query = validatedQuery<PaginationQuery>(req);
  const page = await postService.listExplore(query, req.user?.id);
  res.status(200).json({ data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore } });
});

export const getOne = asyncHandler(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  res.status(200).json({ data: await postService.getPost(id, req.user?.id) });
});

export const create = asyncHandler(async (req, res) => {
  const viewer = requireUser(req);
  if (!req.file) throw ApiError.badRequest('An image is required');

  const input = validatedBody<CreatePostInput>(req);
  const post = await postService.createPost(input, req.file, viewer.id);
  res.status(201).json({ data: post });
});

export const remove = asyncHandler(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  await postService.deletePost(id, requireUser(req).id);
  res.status(204).send();
});

export const like = asyncHandler(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  res.status(200).json({ data: await postService.likePost(id, requireUser(req).id) });
});

export const unlike = asyncHandler(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  res.status(200).json({ data: await postService.unlikePost(id, requireUser(req).id) });
});

export const save = asyncHandler(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  res.status(200).json({ data: await postService.savePost(id, requireUser(req).id) });
});

export const unsave = asyncHandler(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  res.status(200).json({ data: await postService.unsavePost(id, requireUser(req).id) });
});

export const likers = asyncHandler(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  res.status(200).json({ data: await postService.listLikers(id) });
});

export const listComments = asyncHandler(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const query = validatedQuery<PaginationQuery>(req);
  const page = await commentService.listByPost(id, query, req.user?.id);
  res.status(200).json({ data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore } });
});

export const addComment = asyncHandler(async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const input = validatedBody<CreateCommentInput>(req);
  const comment = await commentService.addComment(id, input, requireUser(req).id);
  res.status(201).json({ data: comment });
});
