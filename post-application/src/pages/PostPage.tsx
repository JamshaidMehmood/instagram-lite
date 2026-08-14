import { Box, Button, Stack } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import { useNavigate, useParams } from 'react-router-dom';

import { useGetPostQuery } from '../api/apiSlice';
import { EmptyState } from '../components/EmptyState';
import { PostCard } from '../components/post/PostCard';
import { PostCardSkeleton } from '../components/post/PostCardSkeleton';
import { layout } from '../theme/tokens';
import { getErrorMessage } from '../utils/errors';

/**
 * Permalink for a single post — the destination of the "Copy link" action.
 */
export function PostPage() {
  const { postId = '' } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useGetPostQuery(postId, { skip: !postId });

  return (
    <Box sx={{ maxWidth: layout.contentMaxWidth, mx: 'auto', px: { xs: 0, sm: 2 }, py: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)}
          color="inherit"
          sx={{ alignSelf: 'flex-start', ml: { xs: 2, sm: 0 } }}
        >
          Back
        </Button>

        {isLoading && <PostCardSkeleton />}

        {error && (
          <EmptyState
            icon={<SearchOffIcon />}
            title="Post not found"
            description={getErrorMessage(error, 'This post may have been deleted.')}
            action={{ label: 'Go to feed', onClick: () => navigate('/') }}
          />
        )}

        {/* Comments open by default: arriving from a shared link, the thread is
            usually the reason someone followed it. */}
        {data && <PostCard post={data.data} defaultCommentsOpen />}
      </Stack>
    </Box>
  );
}
