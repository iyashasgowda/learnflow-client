import { useRef, useState, type FormEvent } from 'react';
import { CONSENT_MESSAGES } from '../constants';
import { compact, describeAuthError, validateEmail, type FieldErrors } from './authForm';

interface Options {
  validatePassword: (value: string) => string | undefined;
  action: (email: string, password: string) => Promise<void>;
  // Sign-up forms ask the user to accept the Terms and Privacy Policy; the action only runs once they have.
  requireConsent?: boolean;
}

const FIELD_ORDER = ['email', 'password', 'acceptTerms'] as const;
const FIELDS = [...FIELD_ORDER];
const focusField = (errors: FieldErrors) => {
  const first = FIELD_ORDER.find((name) => errors[name]);
  if (first) document.getElementById(first)?.focus();
};

export function useAuthForm({ validatePassword, action, requireConsent = false }: Options) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // A ref blocks a second submit that arrives before the state update renders.
  const inFlight = useRef(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;

    const found = compact({
      email: validateEmail(email),
      password: validatePassword(password),
      acceptTerms: requireConsent && !accepted ? CONSENT_MESSAGES.required : undefined,
    });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      focusField(found);
      return;
    }

    inFlight.current = true;
    setPending(true);
    try {
      await action(email.trim(), password);
    } catch (err) {
      const described = describeAuthError(err, { fields: FIELDS });
      setFormError(described.form ?? null);
      setErrors(described.fields ?? {});
      focusField(described.fields ?? {});
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return { email, setEmail, password, setPassword, accepted, setAccepted, errors, formError, pending, submit };
}
