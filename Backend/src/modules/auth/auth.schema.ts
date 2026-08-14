import { z } from 'zod';

/**
 * Password policy is enforced here rather than in the model so the failure is
 * a readable 400 with a per-field message the form can render inline.
 */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const signupSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(60),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  // Deliberately not `passwordSchema`: an existing account may predate the
  // current policy, and validating login against it would lock people out.
  password: z.string().min(1, 'Password is required'),
});

/**
 * The whole request is one credential. Identity — email, name, picture — is
 * read from the token *after* Google's signature is verified, never taken from
 * the body, which a caller could set to anyone's address.
 */
export const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Missing Google credential'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
