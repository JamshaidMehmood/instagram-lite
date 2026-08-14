import { Box, Button, InputBase, Stack } from '@mui/material';
import { useState, type FormEvent, type KeyboardEvent } from 'react';

import { useAddCommentMutation } from '../../api/apiSlice';
import { useAppSelector } from '../../store/hooks';
import { getErrorMessage } from '../../utils/errors';
import { useToast } from '../ToastProvider';
import { UserAvatar } from '../UserAvatar';

const MAX_LENGTH = 1000;

interface CommentComposerProps {
  postId: string;
  authorUsername: string;
  autoFocus?: boolean;
}

export function CommentComposer({ postId, authorUsername, autoFocus }: CommentComposerProps) {
  const [text, setText] = useState('');
  const [addComment, { isLoading }] = useAddCommentMutation();
  const viewer = useAppSelector((state) => state.auth.user);
  const { showToast } = useToast();

  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && !isLoading;

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSubmit) return;

    // Cleared up front so the input is immediately reusable; restored only if
    // the request fails, so a slow network never eats what was typed.
    setText('');

    try {
      await addComment({ postId, authorUsername, text: trimmed }).unwrap();
    } catch (error) {
      setText(trimmed);
      showToast(getErrorMessage(error, 'Could not post your comment'), 'error');
    }
  };

  // Enter submits, Shift+Enter is a newline — the convention for a chat-style
  // input where most comments are one line.
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <Stack
      component="form"
      onSubmit={submit}
      direction="row"
      spacing={1.25}
      alignItems="flex-start"
      sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}
    >
      {viewer && <UserAvatar user={viewer} size={30} linkToProfile={false} />}

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <InputBase
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment…"
          multiline
          maxRows={4}
          autoFocus={autoFocus}
          inputProps={{ 'aria-label': 'Add a comment' }}
          sx={{ width: '100%', fontSize: '0.875rem', lineHeight: 1.5, py: 0.5 }}
        />
      </Box>

      <Button
        type="submit"
        size="small"
        disabled={!canSubmit}
        sx={{ alignSelf: 'center', flexShrink: 0, minWidth: 0, px: 1.5 }}
      >
        Post
      </Button>
    </Stack>
  );
}
