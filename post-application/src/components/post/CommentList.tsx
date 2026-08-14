import { Box, Button, IconButton, Skeleton, Stack, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useDeleteCommentMutation, useGetCommentsQuery } from '../../api/apiSlice';
import { getErrorMessage } from '../../utils/errors';
import { formatAbsoluteTime, formatRelativeTime } from '../../utils/time';
import { useToast } from '../ToastProvider';
import { UserAvatar } from '../UserAvatar';

interface CommentListProps {
  postId: string;
  authorUsername: string;
}

export function CommentList({ postId, authorUsername }: CommentListProps) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { data, isLoading, isFetching, error } = useGetCommentsQuery({ postId, cursor });
  const [deleteComment] = useDeleteCommentMutation();
  const { showToast } = useToast();

  const handleDelete = async (commentId: string) => {
    try {
      await deleteComment({ commentId, postId, authorUsername }).unwrap();
    } catch (deleteError) {
      showToast(getErrorMessage(deleteError, 'Could not delete that comment'), 'error');
    }
  };

  if (isLoading) {
    return (
      <Stack spacing={1.5} sx={{ px: 2, py: 1.5 }}>
        {[0, 1].map((index) => (
          <Stack key={index} direction="row" spacing={1.25} alignItems="center">
            <Skeleton variant="circular" width={28} height={28} />
            <Skeleton variant="text" width={`${55 + index * 15}%`} />
          </Stack>
        ))}
      </Stack>
    );
  }

  if (error) {
    return (
      <Typography variant="body2" color="error" sx={{ px: 2, py: 1.5 }}>
        {getErrorMessage(error, 'Could not load comments')}
      </Typography>
    );
  }

  const comments = data?.data ?? [];

  if (comments.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
        No comments yet — be the first.
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5} sx={{ px: 2, py: 1.5 }}>
      {comments.map((comment) => (
        <Stack key={comment.id} direction="row" spacing={1.25} alignItems="flex-start">
          <UserAvatar user={comment.author} size={28} />

          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
              <Box
                component={Link}
                to={`/u/${comment.author.username}`}
                sx={{ fontWeight: 600, color: 'text.primary', textDecoration: 'none', mr: 0.75 }}
              >
                {comment.author.username}
              </Box>
              {comment.text}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              title={formatAbsoluteTime(comment.createdAt)}
            >
              {formatRelativeTime(comment.createdAt)}
            </Typography>
          </Box>

          {/* Server-resolved: the comment's author, or the owner of the post. */}
          {comment.viewerCanDelete && (
            <IconButton
              size="small"
              aria-label="Delete comment"
              onClick={() => handleDelete(comment.id)}
              sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      ))}

      {data?.meta.hasMore && (
        <Button
          size="small"
          disabled={isFetching}
          onClick={() => setCursor(data.meta.nextCursor ?? undefined)}
          sx={{ alignSelf: 'flex-start' }}
        >
          {isFetching ? 'Loading…' : 'View more comments'}
        </Button>
      )}
    </Stack>
  );
}
