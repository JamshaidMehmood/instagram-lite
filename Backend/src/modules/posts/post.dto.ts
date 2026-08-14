import type { Types } from 'mongoose';

import type { IPost } from '../../models/Post';
import { mediaUrl } from '../media/media.service';
import { toPublicUser, type PopulatedAuthor, type PublicUserDTO } from '../users/user.dto';

export interface PostDTO {
  id: string;
  caption: string;
  location: string;
  image: {
    url: string;
    width: number;
    height: number;
    /** Aspect ratio, precomputed so the client can size the box in CSS. */
    aspectRatio: number;
  };
  author: PublicUserDTO;
  likeCount: number;
  commentCount: number;
  /** Whether the caller has liked this post. `false` for anonymous callers. */
  viewerHasLiked: boolean;
  /** Whether the caller has saved this post. `false` for anonymous callers. */
  viewerHasSaved: boolean;
  /** Whether the caller owns it — drives the delete affordance in the UI. */
  viewerIsAuthor: boolean;
  createdAt: string;
}

/** A post row with its author resolved by `populate`. */
export type PopulatedPost = Omit<IPost, 'author'> & {
  _id: Types.ObjectId;
  author: PopulatedAuthor;
};

export function toPostDTO(
  post: PopulatedPost,
  options: { viewerId?: string | undefined; viewerHasLiked: boolean; viewerHasSaved: boolean },
): PostDTO {
  return {
    id: String(post._id),
    caption: post.caption,
    location: post.location,
    image: {
      url: mediaUrl(post.image.mediaId),
      width: post.image.width,
      height: post.image.height,
      aspectRatio: Number((post.image.width / post.image.height).toFixed(4)),
    },
    author: toPublicUser(post.author),
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    viewerHasLiked: options.viewerHasLiked,
    viewerHasSaved: options.viewerHasSaved,
    viewerIsAuthor: Boolean(options.viewerId) && String(post.author._id) === options.viewerId,
    createdAt: post.createdAt.toISOString(),
  };
}
