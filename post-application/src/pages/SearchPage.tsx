import {
  Box,
  IconButton,
  InputAdornment,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { useSearchUsersQuery } from '../api/apiSlice';
import { EmptyState } from '../components/EmptyState';
import { FollowButton } from '../components/FollowButton';
import { UserAvatar } from '../components/UserAvatar';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { layout } from '../theme/tokens';
import { getErrorMessage } from '../utils/errors';

const AVATAR_SIZE = 44;

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The URL seeds the input; from there the input owns the value and the URL
  // trails it. There is deliberately no effect reading the param back into
  // state — it would clobber the keystroke that is still settling, and it is
  // not needed: a shared link and a Back navigation both mount this page
  // fresh, which runs the initialiser below.
  const [term, setTerm] = useState(() => searchParams.get('q') ?? '');
  const query = useDebouncedValue(term).trim();

  const urlTerm = searchParams.get('q') ?? '';

  useEffect(() => {
    if (query === urlTerm) return;
    // `replace`, and only for the settled term: pushing an entry per keystroke
    // would turn Back into a walk through every prefix the user typed rather
    // than a way out of the search. Writing on each keystroke would also mean
    // a `history.replaceState` per character, which browsers rate-limit.
    setSearchParams(query ? { q: query } : {}, { replace: true });
  }, [query, urlTerm, setSearchParams]);

  const { data, isFetching, error, refetch } = useSearchUsersQuery(
    { q: query },
    // An empty box is not a search for everybody — skipping keeps the API out
    // of it entirely and lets the prompt below stand in for a result list.
    { skip: query.length === 0 },
  );

  const shell = (children: React.ReactNode) => (
    <Box
      sx={{
        maxWidth: layout.contentMaxWidth,
        mx: 'auto',
        px: { xs: 2, sm: 3 },
        py: { xs: 2, sm: 3 },
      }}
    >
      <Box
        component="form"
        role="search"
        // The results are live, so there is nothing left for a submit to do —
        // this exists so Enter dismisses the on-screen keyboard instead of
        // reloading the page, and so the field sits in a search landmark.
        onSubmit={(event) => event.preventDefault()}
        sx={{ mb: 3 }}
      >
        <TextField
          inputRef={inputRef}
          // `search` rather than `text`: it labels the mobile Enter key
          // "Search" and is announced as a search field.
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search people by name or username"
          aria-label="Search people"
          autoFocus
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: term ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  aria-label="Clear search"
                  onClick={() => {
                    setTerm('');
                    // Clearing is a step in the search, not the end of one:
                    // focus stays in the box so the next term can be typed.
                    inputRef.current?.focus();
                  }}
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
          sx={{
            // WebKit draws its own clear widget for `type="search"`, which
            // would sit next to ours as a second, differently-styled X.
            '& input::-webkit-search-cancel-button': { display: 'none' },
            '& .MuiOutlinedInput-input': { py: 1.75 },
          }}
        />
      </Box>

      {children}
    </Box>
  );

  if (query.length === 0) {
    return shell(
      <EmptyState
        icon={<PersonSearchOutlinedIcon />}
        title="Search for people"
        description="Start typing a name or a username to find accounts to follow."
      />,
    );
  }

  // `!data` rather than `isLoading` so a retry after a failure shows the
  // skeletons too. A term the user has already searched is served from cache
  // and skips this branch entirely.
  if (isFetching && !data) {
    return shell(
      <Stack spacing={2.5}>
        {[0, 1, 2, 3, 4].map((index) => (
          <Stack key={index} direction="row" spacing={1.75} alignItems="center">
            <Skeleton variant="circular" width={AVATAR_SIZE} height={AVATAR_SIZE} />
            <Stack sx={{ flexGrow: 1 }} spacing={0.5}>
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="60%" height={12} />
            </Stack>
            <Skeleton variant="rounded" width={92} height={30} />
          </Stack>
        ))}
      </Stack>,
    );
  }

  if (error && !data) {
    return shell(
      <EmptyState
        icon={<WifiOffIcon />}
        title="Couldn't run that search"
        description={getErrorMessage(error)}
        action={{ label: 'Try again', onClick: () => void refetch() }}
      />,
    );
  }

  const users = data?.data ?? [];

  if (users.length === 0) {
    return shell(
      <EmptyState
        icon={<SearchOffOutlinedIcon />}
        title="No people found"
        description={`Nobody matches “${query}”. Check the spelling, or try part of a username.`}
      />,
    );
  }

  return shell(
    <Stack spacing={2.5}>
      {users.map((user) => (
        <Stack key={user.id} direction="row" spacing={1.75} alignItems="center">
          {/* Only the identity block links. Wrapping the whole row would put
              the follow <button> inside an <a>, which is invalid markup and
              hands its clicks to the navigation. */}
          <Stack
            component={Link}
            to={`/u/${user.username}`}
            direction="row"
            spacing={1.75}
            alignItems="center"
            sx={{ textDecoration: 'none', color: 'inherit', minWidth: 0, flexGrow: 1 }}
          >
            <UserAvatar user={user} size={AVATAR_SIZE} linkToProfile={false} />
            <Stack sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" noWrap>
                {user.name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                @{user.username}
              </Typography>
              {user.bio && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {user.bio}
                </Typography>
              )}
            </Stack>
          </Stack>

          <FollowButton
            username={user.username}
            isFollowing={user.viewerIsFollowing}
            isViewer={user.isViewer}
          />
        </Stack>
      ))}
    </Stack>,
  );
}
