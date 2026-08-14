import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { Link } from 'react-router-dom';

import { useGetLikersQuery } from '../../api/apiSlice';
import { getErrorMessage } from '../../utils/errors';
import { UserAvatar } from '../UserAvatar';

interface LikesDialogProps {
  postId: string;
  open: boolean;
  onClose: () => void;
}

export function LikesDialog({ postId, open, onClose }: LikesDialogProps) {
  // Nobody pays for this request until the sheet is actually opened.
  const { data, isLoading, error } = useGetLikersQuery(postId, { skip: !open });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1.5 }}>
        <FavoriteIcon sx={{ color: 'like', fontSize: 20 }} />
        <Typography variant="h5" component="span" sx={{ flexGrow: 1 }}>
          Likes
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: 2, py: 2 }}>
        {isLoading && (
          <Stack spacing={1.75}>
            {[0, 1, 2].map((index) => (
              <Stack key={index} direction="row" spacing={1.5} alignItems="center">
                <Skeleton variant="circular" width={38} height={38} />
                <Skeleton variant="text" width="45%" />
              </Stack>
            ))}
          </Stack>
        )}

        {error && (
          <Typography variant="body2" color="error">
            {getErrorMessage(error, 'Could not load likes')}
          </Typography>
        )}

        {data && data.data.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No likes yet.
          </Typography>
        )}

        <Stack spacing={1.5}>
          {data?.data.map((user) => (
            <Stack
              key={user.id}
              component={Link}
              to={`/u/${user.username}`}
              onClick={onClose}
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{ textDecoration: 'none', color: 'inherit' }}
            >
              <UserAvatar user={user} size={38} linkToProfile={false} />
              <Stack sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap>
                  {user.name}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  @{user.username}
                </Typography>
              </Stack>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
