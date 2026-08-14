import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, CircularProgress, Divider, Stack, TextField, Typography } from '@mui/material';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { useLoginMutation } from '../../api/apiSlice';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { DEMO_CREDENTIALS, GOOGLE_CLIENT_ID } from '../../config';
import { sessionEstablished } from '../../store/authSlice';
import { useAppDispatch } from '../../store/hooks';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { AuthLayout } from './AuthLayout';

const schema = z.object({
  email: z.string().min(1, 'Enter your email').email('That does not look like an email address'),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const [login, { isLoading }] = useLoginMutation();
  // Tracked separately so the spinner shows on whichever button was pressed.
  const [demoPending, setDemoPending] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  // Set by RequireAuth when it intercepted a deep link.
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  /** Shared login path for the form and the demo button. */
  const doLogin = async (values: FormValues): Promise<void> => {
    try {
      const response = await login(values).unwrap();
      dispatch(sessionEstablished(response.data));
      navigate(from, { replace: true });
    } catch (error) {
      const fields = getFieldErrors(error);
      // Field-level messages land on the input; anything else becomes a form
      // banner via the `root` error slot.
      (Object.keys(fields) as Array<keyof FormValues>).forEach((field) => {
        if (field === 'email' || field === 'password') {
          setError(field, { message: fields[field] });
        }
      });

      if (!fields.email && !fields.password) {
        setError('root', { message: getErrorMessage(error, 'Could not sign you in') });
      }
    }
  };

  const onSubmit = handleSubmit(doLogin);

  const handleDemo = async () => {
    setDemoPending(true);
    try {
      await doLogin({ ...DEMO_CREDENTIALS });
    } finally {
      setDemoPending(false);
    }
  };

  const busy = isLoading || demoPending;

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <Typography variant="body2" color="text.secondary">
          New here?{' '}
          <Typography component={Link} to="/signup" variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
            Create an account
          </Typography>
        </Typography>
      }
    >
      {/* One banner above everything, because a Google failure and a password
          failure read the same to the person looking at the screen and both
          arrive through the `root` slot. */}
      {errors.root && <Alert severity="error">{errors.root.message}</Alert>}

      {/* Above the form: it is the faster path, and `from` goes with it so a
          Google sign-in honours an intercepted deep link exactly as the
          password form does. */}
      <GoogleSignInButton
        text="signin_with"
        redirectTo={from}
        onError={(message) => setError('root', { message })}
      />

      {/* Paired with the "just looking?" divider below the form, so the two
          read as one deliberate rhythm rather than a stray rule. */}
      {Boolean(GOOGLE_CLIENT_ID) && (
        <Divider sx={{ my: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            or
          </Typography>
        </Divider>
      )}

      <Stack component="form" onSubmit={onSubmit} spacing={2.5} noValidate>
        <TextField
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          autoFocus
          error={Boolean(errors.email)}
          helperText={errors.email?.message}
          {...register('email')}
          fullWidth
        />

        <TextField
          label="Password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          error={Boolean(errors.password)}
          helperText={errors.password?.message}
          {...register('password')}
          fullWidth
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={busy}
          startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
          fullWidth
        >
          {isLoading ? 'Signing in…' : 'Sign in'}
        </Button>
      </Stack>

      <Divider sx={{ my: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          just looking?
        </Typography>
      </Divider>

      <Stack spacing={0.75} alignItems="center">
        <Button
          onClick={handleDemo}
          variant="outlined"
          size="large"
          disabled={busy}
          startIcon={
            demoPending ? <CircularProgress size={16} color="inherit" /> : <PlayCircleOutlineIcon />
          }
          fullWidth
        >
          {demoPending ? 'Entering demo…' : 'Try the demo account'}
        </Button>
        <Typography variant="caption" color="text.secondary">
          {DEMO_CREDENTIALS.email} · {DEMO_CREDENTIALS.password}
        </Typography>
      </Stack>
    </AuthLayout>
  );
}
