import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, CircularProgress, Divider, Stack, TextField, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { useSignupMutation } from '../../api/apiSlice';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { useToast } from '../../components/ToastProvider';
import { GOOGLE_CLIENT_ID } from '../../config';
import { sessionEstablished } from '../../store/authSlice';
import { useAppDispatch } from '../../store/hooks';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { AuthLayout } from './AuthLayout';

/**
 * Mirrors the API's password policy exactly, so the rules are enforced before
 * a request is spent — the server still validates independently and remains
 * the authority.
 */
const schema = z.object({
  name: z.string().trim().min(2, 'Your name needs at least 2 characters').max(60),
  email: z.string().min(1, 'Enter your email').email('That does not look like an email address'),
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .max(128)
    .regex(/[a-z]/, 'Include a lowercase letter')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[0-9]/, 'Include a number'),
});

type FormValues = z.infer<typeof schema>;

export function SignUpPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const [signup, { isLoading }] = useSignupMutation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
    // Re-validate as they type once a field has already failed, so fixing an
    // error clears it immediately instead of at the next submit.
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const response = await signup(values).unwrap();
      // Signup returns a session, so there is no reason to make someone log in
      // again immediately after creating an account.
      dispatch(sessionEstablished(response.data));
      showToast(`Welcome, ${response.data.user.name.split(' ')[0]}`, 'success');
      navigate('/', { replace: true });
    } catch (error) {
      const fields = getFieldErrors(error);
      (['name', 'email', 'password'] as const).forEach((field) => {
        if (fields[field]) setError(field, { message: fields[field] });
      });

      if (!fields.name && !fields.email && !fields.password) {
        setError('root', { message: getErrorMessage(error, 'Could not create your account') });
      }
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes less than a minute."
      footer={
        <Typography variant="body2" color="text.secondary">
          Already have an account?{' '}
          <Typography component={Link} to="/signin" variant="body2" sx={{ fontWeight: 600, color: 'primary.main' }}>
            Sign in
          </Typography>
        </Typography>
      }
    >
      {/* One banner above everything: a Google failure and a signup failure
          both arrive through the `root` slot and read the same to the person
          looking at the screen. */}
      {errors.root && <Alert severity="error">{errors.root.message}</Alert>}

      {/* Above the form — three fields and a password policy is the slow path. */}
      <GoogleSignInButton text="signup_with" onError={(message) => setError('root', { message })} />

      {Boolean(GOOGLE_CLIENT_ID) && (
        <Divider sx={{ my: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            or
          </Typography>
        </Divider>
      )}

      <Stack component="form" onSubmit={onSubmit} spacing={2.5} noValidate>
        <TextField
          label="Full name"
          placeholder="Ayesha Khan"
          autoComplete="name"
          autoFocus
          error={Boolean(errors.name)}
          helperText={errors.name?.message}
          {...register('name')}
          fullWidth
        />

        <TextField
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={Boolean(errors.email)}
          helperText={errors.email?.message}
          {...register('email')}
          fullWidth
        />

        <TextField
          label="Password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          error={Boolean(errors.password)}
          helperText={errors.password?.message ?? 'At least 8 characters, with upper, lower and a number'}
          {...register('password')}
          fullWidth
        />

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isLoading}
          startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
          fullWidth
        >
          {isLoading ? 'Creating account…' : 'Create account'}
        </Button>
      </Stack>
    </AuthLayout>
  );
}
