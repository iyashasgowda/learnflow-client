import { ApiError, NetworkError } from '../api/client';
import { EMAIL_PATTERN, ERROR_CODES, MESSAGES, PASSWORD_RULES, SECONDS_PER_MINUTE } from '../constants';

export type FieldErrors = Partial<Record<string, string>>;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address, like name@example.com.';
  return undefined;
}

export function validateNewPassword(value: string): string | undefined {
  if (!value) return 'Enter a password.';
  if (value.length < PASSWORD_RULES.min) return `Use at least ${PASSWORD_RULES.min} characters.`;
  if (value.length > PASSWORD_RULES.max) return `Use at most ${PASSWORD_RULES.max} characters.`;
  return undefined;
}

export function validateExistingPassword(value: string): string | undefined {
  return value ? undefined : 'Enter your password.';
}

export const compact = (errors: FieldErrors): FieldErrors =>
  Object.fromEntries(Object.entries(errors).filter(([, message]) => message)) as FieldErrors;

export interface DescribedError {
  form?: string;
  fields?: FieldErrors;
}

export interface DescribeOptions {
  // Field names that server validation errors may be attached to.
  fields?: readonly string[];
  // Field that a wrong-password answer belongs to.
  passwordField?: string;
}

function retryMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / SECONDS_PER_MINUTE));
  return `Too many attempts. Wait ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} and try again.`;
}

// Turns an API failure into text that tells the user what to do next.
export function describeAuthError(err: unknown, options: DescribeOptions = {}): DescribedError {
  const knownFields = options.fields ?? ['email', 'password'];
  if (err instanceof NetworkError) return { form: err.message };
  if (!(err instanceof ApiError)) return { form: MESSAGES.generic };

  switch (err.code) {
    case ERROR_CODES.INVALID_CREDENTIALS:
      return { form: 'Incorrect email or password. Check them and try again.' };
    case ERROR_CODES.INVALID_PASSWORD:
      return { fields: { [options.passwordField ?? 'password']: 'That password is not correct. Try again.' } };
    case ERROR_CODES.INVALID_TOKEN:
      return { form: MESSAGES.invalidLink };
    case ERROR_CODES.EMAIL_TAKEN:
      return { fields: { email: 'An account with this email already exists. Try signing in instead.' } };
    case ERROR_CODES.RATE_LIMITED: {
      const seconds = Number(err.details?.retryAfterSeconds);
      return { form: Number.isFinite(seconds) ? retryMessage(seconds) : err.message };
    }
    case ERROR_CODES.VALIDATION_ERROR: {
      const list = Array.isArray(err.details?.fields) ? (err.details.fields as Array<{ path: string; message: string }>) : [];
      const fields: FieldErrors = {};
      for (const item of list) {
        if (knownFields.includes(item.path) && !fields[item.path]) fields[item.path] = item.message;
      }
      return Object.keys(fields).length > 0 ? { fields } : { form: err.message };
    }
    default:
      return { form: err.message || MESSAGES.generic };
  }
}

// Only same-app paths are accepted, so a crafted state cannot send the user elsewhere.
export function destinationFrom(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/';
}
