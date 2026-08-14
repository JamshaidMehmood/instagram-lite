import {
  Box,
  Card,
  Collapse,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import BookmarkBorderOutlinedIcon from '@mui/icons-material/BookmarkBorderOutlined';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import LinkIcon from '@mui/icons-material/Link';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { memo, useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  useDeletePostMutation,
  useLikePostMutation,
  useSavePostMutation,
  useUnlikePostMutation,
  useUnsavePostMutation,
} from '../../api/apiSlice';
import type { Post } from '../../api/types';
import { getErrorMessage } from '../../utils/errors';
import { formatAbsoluteTime, formatCount, formatRelativeTime } from '../../utils/time';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../ToastProvider';
import { UserAvatar } from '../UserAvatar';
import { CommentComposer } from './CommentComposer';
import { CommentList } from './CommentList';
import { LikesDialog } from './LikesDialog';
import { PostImage } from './PostImage';

const CAPTION_TRUNCATE_AT = 180;

interface PostCardProps {
  post: Post;
  /** Comments start open on a single-post page, closed in the feed. */
  defaultCommentsOpen?: boolean;
}

/**
 * `memo` matters here: the feed holds every loaded post in one cache entry, so
 * liking one post produces a new array and would otherwise re-render every
 * card on screen.
 */
export const PostCard = memo(function PostCard({ post, defaultCommentsOpen = false }: PostCardProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(defaultCommentsOpen);
  const [likesOpen, setLikesOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  const [likePost] = useLikePostMutation();
  const [unlikePost] = useUnlikePostMutation();
  const [savePost, saveState] = useSavePostMutation();
  const [unsavePost, unsaveState] = useUnsavePostMutation();
  const [deletePost, { isLoading: isDeleting }] = useDeletePostMutation();
  const { showToast } = useToast();

  const authorUsername = post.author.username;

  const toggleLike = useCallback(async () => {
    const args = { postId: post.id, authorUsername };
    try {
      // The cache is patched optimistically inside the mutation, so the UI has
      // already flipped by the time this resolves.
      if (post.viewerHasLiked) await unlikePost(args).unwrap();
      else await likePost(args).unwrap();
    } catch (error) {
      showToast(getErrorMessage(error, 'Could not update your like'), 'error');
    }
  }, [post.id, post.viewerHasLiked, authorUsername, likePost, unlikePost, showToast]);

  const toggleSave = useCallback(async () => {
    const args = { postId: post.id, authorUsername };
    try {
      if (post.viewerHasSaved) await unsavePost(args).unwrap();
      else await savePost(args).unwrap();
    } catch (error) {
      showToast(getErrorMessage(error, 'Could not update your saved posts'), 'error');
    }
  }, [post.id, post.viewerHasSaved, authorUsername, savePost, unsavePost, showToast]);

  // Double-tap only ever adds a like — accidentally removing one on a
  // mistimed second tap would be infuriating.
  const handleDoubleTapLike = useCallback(() => {
    if (post.viewerHasLiked) return;
    void likePost({ postId: post.id, authorUsername })
      .unwrap()
      .catch(() => undefined);
  }, [post.id, post.viewerHasLiked, authorUsername, likePost]);

  const handleDelete = async () => {
    try {
      await deletePost({ postId: post.id, authorUsername }).unwrap();
      showToast('Post deleted', 'success');
    } catch (error) {
      showToast(getErrorMessage(error, 'Could not delete this post'), 'error');
    } finally {
      setConfirmOpen(false);
    }
  };

  const handleCopyLink = async () => {
    setMenuAnchor(null);
    const url = `${window.location.origin}/p/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard', 'success');
    } catch {
      // Clipboard access is denied in insecure contexts and some browsers.
      showToast(url, 'info');
    }
  };

  const needsTruncation = post.caption.length > CAPTION_TRUNCATE_AT;
  const visibleCaption =
    needsTruncation && !captionExpanded
      ? `${post.caption.slice(0, CAPTION_TRUNCATE_AT).trimEnd()}…`
      : post.caption;

  return (
    <Card component="article" sx={{ overflow: 'visible' }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 2, py: 1.5 }}>
        <UserAvatar user={post.author} size={40} ring />

        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ minWidth: 0 }}>
            <Box
              component={Link}
              to={`/u/${authorUsername}`}
              sx={{ textDecoration: 'none', color: 'text.primary', minWidth: 0 }}
            >
              <Typography variant="subtitle2" noWrap>
                {post.author.name}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" noWrap>
              @{authorUsername}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}>
            {post.location && (
              <>
                <PlaceOutlinedIcon sx={{ fontSize: 13 }} />
                <Typography variant="caption" noWrap>
                  {post.location}
                </Typography>
                <Typography variant="caption">·</Typography>
              </>
            )}
            <Tooltip title={formatAbsoluteTime(post.createdAt)}>
              <Typography variant="caption" component="time" dateTime={post.createdAt}>
                {formatRelativeTime(post.createdAt)}
              </Typography>
            </Tooltip>
          </Stack>
        </Box>

        <IconButton
          size="small"
          aria-label="Post options"
          onClick={(event) => setMenuAnchor(event.currentTarget)}
        >
          <MoreHorizIcon />
        </IconButton>
      </Stack>

      <PostImage
        image={post.image}
        alt={post.caption || `Post by ${post.author.name}`}
        onDoubleTapLike={handleDoubleTapLike}
      />

      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ px: 1, pt: 1 }}>
        <Tooltip title={post.viewerHasLiked ? 'Unlike' : 'Like'}>
          <IconButton
            onClick={toggleLike}
            aria-label={post.viewerHasLiked ? 'Unlike this post' : 'Like this post'}
            aria-pressed={post.viewerHasLiked}
            sx={{
              color: post.viewerHasLiked ? 'like' : 'text.primary',
              '& svg': {
                fontSize: 26,
                // A brief pop on fill makes the state change feel physical.
                transition: 'transform 220ms cubic-bezier(0.2, 0.9, 0.3, 1.4)',
                transform: post.viewerHasLiked ? 'scale(1.12)' : 'scale(1)',
              },
            }}
          >
            {post.viewerHasLiked ? <FavoriteIcon /> : <FavoriteBorderIcon />}
          </IconButton>
        </Tooltip>

        <Tooltip title="Comments">
          <IconButton
            onClick={() => setCommentsOpen((open) => !open)}
            aria-label="Toggle comments"
            aria-expanded={commentsOpen}
            sx={{ '& svg': { fontSize: 24 } }}
          >
            <ChatBubbleOutlineIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Copy link">
          <IconButton onClick={handleCopyLink} aria-label="Copy link to post" sx={{ '& svg': { fontSize: 24 } }}>
            <LinkIcon />
          </IconButton>
        </Tooltip>

        <Box sx={{ flexGrow: 1 }} />

        <Tooltip title={post.viewerHasSaved ? 'Remove from saved' : 'Save'}>
          {/* The span is what a disabled button needs to still deliver hover
              events to the tooltip. Disabling is the whole in-flight treatment:
              the optimistic patch has already flipped the icon, so a spinner
              would only argue with what the user can see. */}
          <Box component="span" sx={{ display: 'inline-flex' }}>
            <IconButton
              onClick={toggleSave}
              disabled={saveState.isLoading || unsaveState.isLoading}
              aria-label={post.viewerHasSaved ? 'Remove from saved' : 'Save post'}
              aria-pressed={post.viewerHasSaved}
              sx={{ '& svg': { fontSize: 24 } }}
            >
              {post.viewerHasSaved ? <BookmarkIcon /> : <BookmarkBorderOutlinedIcon />}
            </IconButton>
          </Box>
        </Tooltip>
      </Stack>

      <Stack spacing={0.75} sx={{ px: 2, pb: 1.5 }}>
        {post.likeCount > 0 && (
          <Box
            component="button"
            type="button"
            onClick={() => setLikesOpen(true)}
            sx={{
              background: 'none',
              border: 0,
              p: 0,
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit',
              color: 'text.primary',
            }}
          >
            <Typography variant="subtitle2">
              {formatCount(post.likeCount)} {post.likeCount === 1 ? 'like' : 'likes'}
            </Typography>
          </Box>
        )}

        {post.caption && (
          <Typography variant="body2" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
            <Box
              component={Link}
              to={`/u/${authorUsername}`}
              sx={{ fontWeight: 600, color: 'text.primary', textDecoration: 'none', mr: 0.75 }}
            >
              {authorUsername}
            </Box>
            {visibleCaption}
            {needsTruncation && !captionExpanded && (
              <Box
                component="button"
                type="button"
                onClick={() => setCaptionExpanded(true)}
                sx={{
                  background: 'none',
                  border: 0,
                  p: 0,
                  ml: 0.5,
                  cursor: 'pointer',
                  font: 'inherit',
                  color: 'text.secondary',
                }}
              >
                more
              </Box>
            )}
          </Typography>
        )}

        {post.commentCount > 0 && !commentsOpen && (
          <Box
            component="button"
            type="button"
            onClick={() => setCommentsOpen(true)}
            sx={{
              background: 'none',
              border: 0,
              p: 0,
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit',
              color: 'text.secondary',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              View {post.commentCount === 1 ? '1 comment' : `all ${post.commentCount} comments`}
            </Typography>
          </Box>
        )}
      </Stack>

      {/* `unmountOnExit` keeps the comments query from running for every card
          in the feed — it only fires once a thread is actually opened. */}
      <Collapse in={commentsOpen} unmountOnExit>
        <Divider />
        <CommentList postId={post.id} authorUsername={authorUsername} />
        <CommentComposer postId={post.id} authorUsername={authorUsername} />
      </Collapse>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={handleCopyLink}>
          <LinkIcon fontSize="small" sx={{ mr: 1.5 }} />
          Copy link
        </MenuItem>
        {/* Resolved by the server from the access token, not from a client-side
            email comparison as the previous version did. */}
        {post.viewerIsAuthor && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              setConfirmOpen(true);
            }}
            sx={{ color: 'error.main' }}
          >
            <DeleteOutlineIcon fontSize="small" sx={{ mr: 1.5 }} />
            Delete post
          </MenuItem>
        )}
      </Menu>

      <LikesDialog postId={post.id} open={likesOpen} onClose={() => setLikesOpen(false)} />

      <ConfirmDialog
        open={confirmOpen}
        title="Delete this post?"
        description="This removes the post, its image, and all of its comments. It cannot be undone."
        confirmLabel="Delete"
        destructive
        busy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </Card>
  );
});
