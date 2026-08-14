import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import type { ApiErrorBody } from '../api/types';

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.message === 'string'
  );
}

/**
 * Turns anything RTK Query can hand back into a sentence worth showing a user.
 *
 * A network failure and a 500 are indistinguishable to the person looking at
 * the screen, so both get actionable copy rather than a status code.
 */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!error) return fallback;

  const fetchError = error as FetchBaseQueryError;

  if (fetchError.status === 'FETCH_ERROR') {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (fetchError.status === 'TIMEOUT_ERROR') {
    return 'The request timed out. Please try again.';
  }
  if (fetchError.status === 'PARSING_ERROR') {
    return fallback;
  }
  if (isApiErrorBody(fetchError.data)) {
    return fetchError.data.error.message;
  }
  if (error instanceof Error) return error.message;

  return fallback;
}

/**
 * Per-field messages from a 400, keyed exactly as the form fields are named so
 * they can be dropped straight into react-hook-form's `setError`.
 */
export function getFieldErrors(error: unknown): Record<string, string> {
  const fetchError = error as FetchBaseQueryError | undefined;
  if (fetchError && isApiErrorBody(fetchError.data)) {
    return fetchError.data.error.details ?? {};
  }
  return {};
}
