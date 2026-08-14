import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  requireUser,
  validatedBody,
  validatedParams,
  validatedQuery,
} from '../../utils/request';
import * as postService from '../posts/post.service';
import type { PaginationQuery } from '../posts/post.schema';
import * as userService from './user.service';
import type { SearchQuery, UpdateProfileInput } from './user.schema';

export const getProfile = asyncHandler(async (req, res) => {
  const { username } = validatedParams<{ username: string }>(req);
  res.status(200).json({ data: await userService.getProfile(username, req.user?.id) });
});

export const listPosts = asyncHandler(async (req, res) => {
  const { username } = validatedParams<{ username: string }>(req);
  const query = validatedQuery<PaginationQuery>(req);

  const user = await userService.findByUsername(username);
  const page = await postService.listByAuthor(user._id, query, req.user?.id);

  res
    .status(200)
    .json({ data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore } });
});

export const suggestions = asyncHandler(async (req, res) => {
  res.status(200).json({ data: await userService.listSuggestions(req.user?.id) });
});

export const search = asyncHandler(async (req, res) => {
  const { q, limit } = validatedQuery<SearchQuery>(req);
  res.status(200).json({ data: await userService.searchUsers(q, req.user?.id, limit) });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const input = validatedBody<UpdateProfileInput>(req);
  res.status(200).json({ data: await userService.updateProfile(requireUser(req).id, input) });
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  const viewer = requireUser(req);
  // Mirrors `post.controller.create`: multer leaves `req.file` undefined when
  // the part is simply absent, and only a handler can tell that apart from a
  // file it rejected — the filter throws for those, so reaching here with no
  // file means the client sent none.
  if (!req.file) throw ApiError.badRequest('An image is required');

  res.status(200).json({ data: await userService.setAvatar(viewer.id, req.file) });
});

export const removeAvatar = asyncHandler(async (req, res) => {
  res.status(200).json({ data: await userService.removeAvatar(requireUser(req).id) });
});

export const listSaved = asyncHandler(async (req, res) => {
  const viewer = requireUser(req);
  const query = validatedQuery<PaginationQuery>(req);
  const page = await postService.listSavedByUser(viewer.id, query);

  res
    .status(200)
    .json({ data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore } });
});

export const follow = asyncHandler(async (req, res) => {
  const { username } = validatedParams<{ username: string }>(req);
  res.status(200).json({ data: await userService.followUser(username, requireUser(req).id) });
});

export const unfollow = asyncHandler(async (req, res) => {
  const { username } = validatedParams<{ username: string }>(req);
  res.status(200).json({ data: await userService.unfollowUser(username, requireUser(req).id) });
});

export const listFollowers = asyncHandler(async (req, res) => {
  const { username } = validatedParams<{ username: string }>(req);
  const query = validatedQuery<PaginationQuery>(req);
  const page = await userService.listFollowers(username, query, req.user?.id);

  res
    .status(200)
    .json({ data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore } });
});

export const listFollowing = asyncHandler(async (req, res) => {
  const { username } = validatedParams<{ username: string }>(req);
  const query = validatedQuery<PaginationQuery>(req);
  const page = await userService.listFollowing(username, query, req.user?.id);

  res
    .status(200)
    .json({ data: page.items, meta: { nextCursor: page.nextCursor, hasMore: page.hasMore } });
});
