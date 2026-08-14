import {
  Box,
  Button,
  Card,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { useCreatePostMutation } from '../api/apiSlice';
import { useToast } from '../components/ToastProvider';
import { ACCEPTED_IMAGE_TYPES, MAX_CAPTION_LENGTH, MAX_UPLOAD_BYTES } from '../config';
import { getErrorMessage, getFieldErrors } from '../utils/errors';

function describeSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CreatePostPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [createPost, { isLoading }] = useCreatePostMutation();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [captionError, setCaptionError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

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

  const acceptFile = useCallback(
    (candidate: File | undefined) => {
      if (!candidate) return;

      if (!ACCEPTED_IMAGE_TYPES.includes(candidate.type)) {
        setFileError('Choose a JPEG, PNG, WebP or GIF image.');
        return;
      }
      if (candidate.size > MAX_UPLOAD_BYTES) {
        setFileError(
          `That image is ${describeSize(candidate.size)}. The limit is ${describeSize(MAX_UPLOAD_BYTES)}.`,
        );
        return;
      }

      setFileError(null);
      setFile(candidate);
    },
    [],
  );

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!file) {
      setFileError('Add a photo to share.');
      return;
    }
    if (!caption.trim()) {
      setCaptionError('Write a caption.');
      return;
    }

    const body = new FormData();
    // Field names must match what multer and the zod schema expect.
    body.append('image', file);
    body.append('caption', caption.trim());
    body.append('location', location.trim());

    try {
      await createPost(body).unwrap();
      showToast('Your post is live', 'success');
      navigate('/');
    } catch (error) {
      // Surface per-field messages from the API's 400 next to the right input.
      const fields = getFieldErrors(error);
      if (fields.caption) setCaptionError(fields.caption);
      if (fields.image) setFileError(fields.image);
      if (!fields.caption && !fields.image) {
        showToast(getErrorMessage(error, 'Could not share your post'), 'error');
      }
    }
  };

  return (
    <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 2, sm: 3 }, py: { xs: 3, sm: 5 } }}>
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant="h2">New post</Typography>
        <Typography variant="body2" color="text.secondary">
          Share a photo with everyone on the feed.
        </Typography>
      </Stack>

      <Card component="form" onSubmit={handleSubmit} sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack spacing={3}>
          {previewUrl && file ? (
            <Box sx={{ position: 'relative' }}>
              <Box
                component="img"
                src={previewUrl}
                alt="Selected photo preview"
                sx={{
                  width: '100%',
                  maxHeight: 460,
                  objectFit: 'contain',
                  borderRadius: 2,
                  bgcolor: 'action.hover',
                  display: 'block',
                }}
              />
              <IconButton
                aria-label="Remove photo"
                onClick={() => setFile(null)}
                sx={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  bgcolor: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {file.name} · {describeSize(file.size)}
              </Typography>
            </Box>
          ) : (
            <Box
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
              }}
              role="button"
              tabIndex={0}
              aria-label="Choose a photo to upload"
              sx={{
                border: '2px dashed',
                borderColor: dragging ? 'primary.main' : 'divider',
                bgcolor: dragging ? 'action.hover' : 'transparent',
                borderRadius: 3,
                py: { xs: 6, sm: 8 },
                px: 3,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 180ms ease, background-color 180ms ease',
                '&:hover': { borderColor: 'primary.main' },
              }}
            >
              <Stack spacing={1.5} alignItems="center">
                <CloudUploadOutlinedIcon sx={{ fontSize: 44, color: 'text.secondary' }} />
                <Typography variant="h5">Drag a photo here</Typography>
                <Typography variant="body2" color="text.secondary">
                  or click to browse · JPEG, PNG, WebP or GIF up to {describeSize(MAX_UPLOAD_BYTES)}
                </Typography>
              </Stack>
            </Box>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            hidden
            onChange={(event) => {
              acceptFile(event.target.files?.[0]);
              // Reset so re-selecting the same file still fires `change`.
              event.target.value = '';
            }}
          />

          {fileError && (
            <Typography variant="body2" color="error">
              {fileError}
            </Typography>
          )}

          <TextField
            label="Caption"
            placeholder="Say something about this photo…"
            multiline
            minRows={3}
            maxRows={10}
            value={caption}
            onChange={(event) => {
              setCaption(event.target.value.slice(0, MAX_CAPTION_LENGTH));
              setCaptionError(null);
            }}
            error={Boolean(captionError)}
            helperText={captionError ?? `${caption.length} / ${MAX_CAPTION_LENGTH}`}
            fullWidth
          />

          <TextField
            label="Location"
            placeholder="Add a location (optional)"
            value={location}
            onChange={(event) => setLocation(event.target.value.slice(0, 100))}
            fullWidth
            InputProps={{
              startAdornment: <PlaceOutlinedIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />,
            }}
          />

          <Stack direction="row" spacing={1.5} justifyContent="flex-end">
            <Button color="inherit" onClick={() => navigate('/')} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={isLoading}
              startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              {isLoading ? 'Sharing…' : 'Share'}
            </Button>
          </Stack>
        </Stack>
      </Card>
    </Box>
  );
}
