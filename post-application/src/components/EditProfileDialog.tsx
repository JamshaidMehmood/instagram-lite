import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  useRemoveAvatarMutation,
  useUpdateProfileMutation,
  useUploadAvatarMutation,
} from '../api/apiSlice';
import type { CurrentUser } from '../api/types';
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from '../config';
import { getErrorMessage, getFieldErrors } from '../utils/errors';
import { useToast } from './ToastProvider';
import { UserAvatar } from './UserAvatar';

/** Mirrors the `bio` maxlength on the User model. */
const MAX_BIO_LENGTH = 160;

const FORM_ID = 'edit-profile-form';

/**
 * Mirrors the API's rules exactly, so a value that cannot be stored is rejected
 * before a request is spent — the server still validates independently and
 * remains the authority.
 *
 * `trim`/`toLowerCase` are part of the schema rather than the submit handler
 * because the API normalises the same way: what this produces is byte-for-byte
 * what gets stored, which is what lets the caller be told the new username
 * without reading it back.
 */
const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Your name needs at least 2 characters')
    .max(60, 'Keep your name under 60 characters'),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Usernames need at least 3 characters')
    .max(30, 'Keep your username under 30 characters')
    .regex(/^[a-z0-9._]+$/, 'Letters, numbers, dots and underscores only'),
  bio: z.string().trim().max(MAX_BIO_LENGTH, `Keep your bio under ${MAX_BIO_LENGTH} characters`),
});

type FormValues = z.infer<typeof schema>;

interface EditProfileDialogProps {
  open: boolean;
  onClose: () => void;
  user: CurrentUser;
  /** Called with the new username when it changed, so the caller can navigate. */
  onUsernameChanged: (username: string) => void;
}

function describeSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Editing your own profile: the three text fields and the avatar.
 *
 * The avatar is deliberately not part of the submit. A photo is its own
 * request, fired the moment one is picked, so the preview on screen is a
 * confirmed server state rather than a promise the Save button might never
 * keep — and so closing without saving never leaves a photo half-applied.
 */
export function EditProfileDialog({ open, onClose, user, onUsernameChanged }: EditProfileDialogProps) {
  const { showToast } = useToast();

  const [updateProfile, { isLoading: isSaving }] = useUpdateProfileMutation();
  const [uploadAvatar, { isLoading: isUploading }] = useUploadAvatarMutation();
  const [removeAvatar, { isLoading: isRemoving }] = useRemoveAvatarMutation();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const busy = isSaving || isUploading || isRemoving;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: user.name, username: user.username, bio: user.bio },
    // Re-validate as they type once a field has already failed, so fixing an
    // error clears it immediately instead of at the next submit.
    mode: 'onTouched',
  });

  // Reopening has to start from what the account currently says: a half-typed
  // username left behind from a cancelled edit would otherwise be presented as
  // if it were saved. Depending on the individual fields rather than the `user`
  // object means a fresh object from the avatar request — same values, new
  // identity — does not wipe edits in progress.
  useEffect(() => {
    if (!open) return;
    reset({ name: user.name, username: user.username, bio: user.bio });
    setFile(null);
    setAvatarError(null);
  }, [open, reset, user.name, user.username, user.bio]);

  // Object URLs hold the file in memory until revoked; not doing so leaks a
  // few megabytes every time the user swaps their selection.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const acceptFile = async (candidate: File | undefined) => {
    if (!candidate) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(candidate.type)) {
      setAvatarError('Choose a JPEG, PNG, WebP or GIF image.');
      return;
    }
    if (candidate.size > MAX_UPLOAD_BYTES) {
      setAvatarError(
        `That image is ${describeSize(candidate.size)}. The limit is ${describeSize(MAX_UPLOAD_BYTES)}.`,
      );
      return;
    }

    setAvatarError(null);
    // Shown before the upload finishes: the local bytes are already decoded, so
    // the new photo appears instantly instead of after a round trip.
    setFile(candidate);

    const body = new FormData();
    // Field name must match what multer expects.
    body.append('image', candidate);

    try {
      await uploadAvatar(body).unwrap();
      showToast('Photo updated', 'success');
    } catch (error) {
      // Drop the preview: leaving it up would show a photo the server rejected.
      setFile(null);
      const fields = getFieldErrors(error);
      setAvatarError(fields.image ?? getErrorMessage(error, 'Could not update your photo'));
    }
  };

  const handleRemovePhoto = async () => {
    try {
      await removeAvatar().unwrap();
      setFile(null);
      setAvatarError(null);
      showToast('Photo removed', 'success');
    } catch (error) {
      setAvatarError(getErrorMessage(error, 'Could not remove your photo'));
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      await updateProfile(values).unwrap();
      showToast('Profile updated', 'success');
      // The schema already applied the API's normalisation, so this is the
      // canonical username the profile now lives at.
      if (values.username !== user.username) onUsernameChanged(values.username);
      onClose();
    } catch (error) {
      const fields = getFieldErrors(error);
      (['name', 'username', 'bio'] as const).forEach((field) => {
        if (fields[field]) setError(field, { message: fields[field] });
      });
      if (fields.name || fields.username || fields.bio) return;

      // A taken username comes back as a 409 with no per-field details — it is
      // a conflict, not a validation failure — but it is still the username's
      // problem, and a banner would leave the offending field looking fine.
      if ((error as FetchBaseQueryError).status === 409) {
        setError('username', { message: getErrorMessage(error, 'That username is taken') });
        return;
      }

      showToast(getErrorMessage(error, 'Could not save your profile'), 'error');
    }
  });

  const bio = watch('bio');
  // The preview wins while one is pending or just uploaded: the server URL for
  // a fresh avatar has not been fetched yet, and swapping to it here would
  // blink through the initial-letter fallback.
  const avatarUrl = previewUrl ?? user.avatarUrl;
  const hasPhoto = Boolean(avatarUrl);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1.5 }}>
        <ManageAccountsOutlinedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
        <Typography variant="h5" component="span" sx={{ flexGrow: 1 }}>
          Edit profile
        </Typography>
        <IconButton onClick={onClose} disabled={busy} size="small" aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 3 }}>
        <Stack spacing={3}>
          <Stack direction="row" spacing={2} alignItems="center">
            <UserAvatar user={{ ...user, avatarUrl }} size={72} linkToProfile={false} />

            <Stack spacing={1} sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={
                    isUploading ? (
                      <CircularProgress size={14} color="inherit" />
                    ) : (
                      <PhotoCameraOutlinedIcon fontSize="small" />
                    )
                  }
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                >
                  {isUploading ? 'Uploading…' : 'Change photo'}
                </Button>

                {hasPhoto && (
                  <Button
                    size="small"
                    color="error"
                    startIcon={
                      isRemoving ? (
                        <CircularProgress size={14} color="inherit" />
                      ) : (
                        <DeleteOutlineIcon fontSize="small" />
                      )
                    }
                    onClick={handleRemovePhoto}
                    disabled={busy}
                  >
                    Remove photo
                  </Button>
                )}
              </Stack>

              <Typography
                variant="caption"
                color={avatarError ? 'error' : 'text.secondary'}
                sx={{ display: 'block' }}
              >
                {avatarError ?? `JPEG, PNG, WebP or GIF up to ${describeSize(MAX_UPLOAD_BYTES)}`}
              </Typography>
            </Stack>
          </Stack>

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            hidden
            onChange={(event) => {
              void acceptFile(event.target.files?.[0]);
              // Reset so re-selecting the same file still fires `change`.
              event.target.value = '';
            }}
          />

          {/* The submit button lives in DialogActions, outside this element, so
              it is wired back to the form by id rather than by nesting. */}
          <Stack id={FORM_ID} component="form" onSubmit={onSubmit} spacing={2.5} noValidate>
            <TextField
              label="Name"
              placeholder="Ayesha Khan"
              autoComplete="name"
              disabled={busy}
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
              {...register('name')}
              fullWidth
            />

            <TextField
              label="Username"
              placeholder="ayesha.khan"
              autoComplete="username"
              disabled={busy}
              error={Boolean(errors.username)}
              helperText={
                errors.username?.message ?? 'Your profile lives at /u/your-username'
              }
              {...register('username')}
              fullWidth
            />

            <TextField
              label="Bio"
              placeholder="Tell people a little about yourself…"
              multiline
              minRows={3}
              maxRows={6}
              disabled={busy}
              error={Boolean(errors.bio)}
              helperText={errors.bio?.message ?? `${bio.length} / ${MAX_BIO_LENGTH}`}
              {...register('bio')}
              fullWidth
            />
          </Stack>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5, gap: 1 }}>
        <Button onClick={onClose} disabled={busy} color="inherit">
          Cancel
        </Button>
        <Button
          type="submit"
          form={FORM_ID}
          variant="contained"
          disabled={busy}
          startIcon={isSaving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
