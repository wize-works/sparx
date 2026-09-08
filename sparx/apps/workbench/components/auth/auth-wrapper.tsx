'use client';

// The workbench's one logged-out surface. Sign-in and create-account are the
// SAME wrapper — a `mode` toggle flips between them in place (no route change,
// no second component owning half the fields), which is why account creation
// lives here and not on a separate page. Every sign-in method the backend
// supports sits on one card (the "one screen, all methods" decision): Continue
// with Google, email + password, a one-time email code, a magic sign-in link,
// and a passkey. Google One Tap layers on top when a client id is configured
// (see GoogleOneTap) — it needs no card real estate of its own.
//
// Passwordless (code / link) is unified create-or-sign-in: Better Auth's
// email-OTP and magic-link both provision a tenant for a first-time address via
// the same user.create hook Google uses, so a brand-new operator can start with
// just their email and land straight in onboarding.

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogIn, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { authClient, emailOtp, signIn, twoFactor } from '@wizeworks/auth/client';
import {
  Alert,
  Button,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
  PasswordInput,
  Text,
} from '@wizeworks/silicaui-react';
import { AuthDivider, AuthShell, GoogleButton } from '../auth-shell';
import { GoogleOneTap } from './google-one-tap';
import { signUpAction } from './sign-up-action';
import { identifyFirstTouch } from '../../lib/analytics';

/** Better Auth's default minimum — checked here so the hint and the server agree. */
const MIN_PASSWORD = 8;
const OTP_LENGTH = 6;
/** Platform legal pages — served by the marketing site, opened in a new tab. */
const LEGAL_BASE = 'https://sparx.works/legal';

/** How many characters a backup code is (server: backupCodeOptions.length). */
const BACKUP_CODE_LENGTH = 10;

type Mode = 'signIn' | 'signUp';
/** The card body swaps between the method form and each mid-flow confirmation. */
type View = 'form' | 'otp' | 'linkSent' | 'forgotPassword' | 'resetSent' | 'twoFactor';
type Pending =
  null | 'password' | 'sendCode' | 'verifyCode' | 'link' | 'passkey' | 'reset' | 'twoFactor';

/** Whether a sign-in response is really "correct credentials, now prove the
 *  second factor". Better Auth answers `{ twoFactorRedirect: true }` in place of
 *  a session; we read it defensively because the flag only exists on the
 *  two-factor branch of the response union. */
function needsSecondFactor(data: unknown): boolean {
  return (data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect === true;
}

/** The required "I agree to the policies" row shown in create-account mode. It
 *  sits ABOVE every sign-up method so it visibly governs all of them (Google,
 *  code, link, password all block until it's checked). */
function LegalAgreement({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const link = 'text-primary font-medium hover:underline';
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        id="agreeLegal"
        className="mt-0.5"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        aria-label="I agree to the Terms of Service, Privacy Policy, and Acceptable Use Policy"
      />
      <Text className="text-sm">
        I agree to the{' '}
        <a href={`${LEGAL_BASE}/terms`} target="_blank" rel="noopener noreferrer" className={link}>
          Terms of Service
        </a>
        ,{' '}
        <a
          href={`${LEGAL_BASE}/privacy`}
          target="_blank"
          rel="noopener noreferrer"
          className={link}
        >
          Privacy Policy
        </a>
        , and{' '}
        <a href={`${LEGAL_BASE}/aup`} target="_blank" rel="noopener noreferrer" className={link}>
          Acceptable Use Policy
        </a>
        .
      </Text>
    </div>
  );
}

export interface AuthWrapperProps {
  initialMode: Mode;
  /** Google OAuth client id, passed from the server (process.env at request time,
   *  never a NEXT_PUBLIC bake) so the portable image resolves it per environment.
   *  Undefined → the Google button still works via redirect, One Tap stays off. */
  googleClientId?: string;
  /** Where to land after a successful sign-in/create. Already sanitized to a
   *  same-origin path by the server (safeInternalPath). Defaults to '/'. Drives
   *  the MCP consent return: an operator sent here mid-authorize lands back on
   *  /oauth/consent instead of the shell. Every method honors it — password, code,
   *  link, passkey, Google, and One Tap. */
  callbackURL?: string;
}

export function AuthWrapper({ initialMode, googleClientId, callbackURL = '/' }: AuthWrapperProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [view, setView] = useState<View>('form');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [agreeLegal, setAgreeLegal] = useState(false);

  // Second-factor challenge state. `useBackupCode` swaps the challenge between
  // the app's 6-digit code and a 10-character backup code — same step, same
  // card, because "I don't have my phone" is a branch of the same question, not
  // a different screen. `trustDevice` defaults OFF: skipping the second factor
  // for a month is a real weakening of it, so it is something the operator opts
  // into, never something we assume on their behalf.
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);

  const isSignUp = mode === 'signUp';
  const busy = pending !== null;
  // Create-account mode blocks EVERY method (Google, code, link, password) until
  // the legal agreement is accepted — the checkbox governs the whole card, so a
  // new account can only be made after the operator agrees.
  const createBlocked = isSignUp && !agreeLegal;

  function finish() {
    // callbackURL defaults to '/', where a fresh account hits the setup gate; the
    // MCP consent flow overrides it to return to /oauth/consent.
    router.replace(callbackURL);
    router.refresh();
  }

  function switchMode(next: Mode) {
    setMode(next);
    setView('form');
    setError(null);
    setPassword('');
    setCode('');
    setAgreeLegal(false);
    setUseBackupCode(false);
    setTrustDevice(false);
  }

  /** Hand off to the second-factor challenge. The password is cleared on the
   *  way — it has already done its job, and holding it in state through a step
   *  that can sit open for minutes buys nothing. */
  function challengeSecondFactor() {
    setPassword('');
    setCode('');
    setUseBackupCode(false);
    setError(null);
    setPending(null);
    setView('twoFactor');
  }

  // Passkey conditional UI: arm the browser's autofill so a returning operator can
  // pick a passkey straight from the email field. Sign-in only, best-effort — if
  // the browser has no conditional mediation or the user has no passkey, this
  // rejects and we simply stay on the form.
  useEffect(() => {
    if (isSignUp || view !== 'form') return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await signIn.passkey({ autoFill: true });
        if (!cancelled && res && !res.error) finish();
      } catch {
        // No conditional UI / no enrolled passkey — nothing to do.
      }
    })();
    return () => {
      cancelled = true;
    };
    // finish/router are stable; re-arm only when the mode or view changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignUp, view]);

  async function onPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (isSignUp && password.length < MIN_PASSWORD) {
      setError(`Use a password of at least ${String(MIN_PASSWORD)} characters.`);
      return;
    }
    if (isSignUp && !agreeLegal) {
      setError('Please accept the policies to create your account.');
      return;
    }

    setPending('password');

    if (isSignUp) {
      // Create-account runs on the server so the tenant, owner, and the platform
      // legal-acceptance record commit atomically with the request IP/UA — the
      // canonical signUpMerchant flow, which also signs the new user in.
      const res = await signUpAction({ name: name.trim(), email, password, agreeLegal });
      if (!res.ok) {
        setError(res.error ?? 'We could not create your account. Please try again.');
        setPending(null);
        return;
      }
      // Stamp first-touch acquisition onto the new PostHog person before we
      // navigate away. Only the password path returns a userId; the passwordless
      // (code/link) and Google methods are create-or-sign-in, so "brand-new
      // account" isn't knowable client-side and they don't first-touch here.
      if (res.userId) identifyFirstTouch(res.userId);
      finish();
      return;
    }

    const result = await signIn.email({ email, password });
    if (result.error) {
      // Deliberately vague: distinguishing "no such account" from "wrong password"
      // tells an attacker which emails are registered.
      setError('That email and password combination did not work. Please try again.');
      setPending(null);
      return;
    }

    // Right password, but the account asks for a second step — no session has
    // been issued yet, so this is a continuation of signing in, not a success.
    if (needsSecondFactor(result.data)) {
      challengeSecondFactor();
      return;
    }

    finish();
  }

  async function onSendCode() {
    if (createBlocked) {
      setError('Please accept the policies to create your account.');
      return;
    }
    if (!email) {
      setError('Enter your email first, then we can send you a code.');
      return;
    }
    setError(null);
    setPending('sendCode');
    // type: 'sign-in' create-or-signs-in — a first-time email is provisioned a
    // tenant, an existing one just gets a code.
    const result = await emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
    setPending(null);
    if (result.error) {
      setError('We could not send a code right now. Please try again.');
      return;
    }
    setCode('');
    setView('otp');
  }

  async function onVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending('verifyCode');
    const result = await signIn.emailOtp({ email, otp: code });
    if (result.error) {
      setError('That code did not match, or it has expired. Request a new one.');
      setPending(null);
      return;
    }
    if (needsSecondFactor(result.data)) {
      challengeSecondFactor();
      return;
    }
    finish();
  }

  /** Complete the second-factor challenge with either an authenticator code or
   *  a backup code. Both end the same way — a session, and the app. */
  async function onVerifyTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending('twoFactor');
    const result = useBackupCode
      ? await twoFactor.verifyBackupCode({ code, trustDevice })
      : await twoFactor.verifyTotp({ code, trustDevice });
    if (result.error) {
      setError(
        useBackupCode
          ? 'That backup code did not work. Each code can only be used once — try another one.'
          : 'That code did not work. Codes change every 30 seconds, so check your app for the current one.'
      );
      setCode('');
      setPending(null);
      return;
    }
    finish();
  }

  async function onSendLink() {
    if (createBlocked) {
      setError('Please accept the policies to create your account.');
      return;
    }
    if (!email) {
      setError('Enter your email first, then we can send you a link.');
      return;
    }
    setError(null);
    setPending('link');
    const result = await signIn.magicLink({ email, callbackURL });
    setPending(null);
    if (result.error) {
      setError('We could not send a link right now. Please try again.');
      return;
    }
    setView('linkSent');
  }

  async function onSendReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email) {
      setError('Enter your email so we know where to send the reset link.');
      return;
    }
    setError(null);
    setPending('reset');
    // Always land on the same confirmation — never reveal whether the account
    // exists. Better Auth appends ?token= to redirectTo for the reset page.
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    setPending(null);
    setView('resetSent');
  }

  async function onPasskey() {
    setError(null);
    setPending('passkey');
    try {
      const result = await signIn.passkey();
      if (result?.error) {
        setError('That passkey did not work. Try another sign-in method.');
        setPending(null);
        return;
      }
      finish();
    } catch {
      setError('Passkey sign-in was cancelled or is unavailable on this device.');
      setPending(null);
    }
  }

  // ── Code-entry view ────────────────────────────────────────────────────────
  if (view === 'otp') {
    return (
      <AuthShell tabs={[{ id: 'otp', label: 'Enter your code', icon: Mail }]} activeTab="otp">
        <form onSubmit={onVerifyCode} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Check your email</h2>
            <Text className="text-sm">
              We sent a {OTP_LENGTH}-digit code to <span className="font-medium">{email}</span>.
              Enter it below to continue.
            </Text>
          </div>

          {error ? (
            <Alert color="danger" variant="soft" role="alert">
              {error}
            </Alert>
          ) : null}

          <Field>
            <FieldLabel>Verification code</FieldLabel>
            <FieldControl
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={OTP_LENGTH}
              required
              className="text-center text-lg tracking-[0.5em]"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH));
              }}
            />
          </Field>

          <Button
            type="submit"
            color="primary"
            disabled={busy || code.length < OTP_LENGTH}
            loading={pending === 'verifyCode'}
          >
            Verify and continue
          </Button>

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="link"
              size="sm"
              disabled={busy}
              onClick={() => {
                setError(null);
                setView('form');
              }}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="link"
              size="sm"
              disabled={busy}
              loading={pending === 'sendCode'}
              onClick={() => void onSendCode()}
            >
              Resend code
            </Button>
          </div>
        </form>
      </AuthShell>
    );
  }

  // ── Second-factor challenge view ─────────────────────────────────────────────
  // Reached only after the password (or emailed code) has already been accepted.
  // There is no "back to sign in" here on purpose: going back would suggest the
  // first step can be retried around this one, which it cannot.
  if (view === 'twoFactor') {
    const expectedLength = useBackupCode ? BACKUP_CODE_LENGTH : OTP_LENGTH;
    return (
      <AuthShell
        tabs={[{ id: 'twoFactor', label: 'Two-step verification', icon: ShieldCheck }]}
        activeTab="twoFactor"
      >
        <form onSubmit={onVerifyTwoFactor} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">
              {useBackupCode ? 'Use a backup code' : 'Enter the code from your app'}
            </h2>
            <Text className="text-sm">
              {useBackupCode
                ? 'Enter one of the backup codes you saved when you turned on two-step verification. Each code works once.'
                : 'Open your authenticator app and enter the 6-digit code it shows for sparx. The code changes every 30 seconds.'}
            </Text>
          </div>

          {error ? (
            <Alert color="danger" variant="soft" role="alert">
              {error}
            </Alert>
          ) : null}

          <Field>
            <FieldLabel>{useBackupCode ? 'Backup code' : 'Verification code'}</FieldLabel>
            <FieldControl
              // A backup code is alphanumeric, so only the app code gets the
              // numeric keypad + one-time-code autofill.
              {...(useBackupCode
                ? { autoComplete: 'off' as const }
                : {
                    inputMode: 'numeric' as const,
                    autoComplete: 'one-time-code' as const,
                    pattern: '[0-9]*',
                  })}
              maxLength={expectedLength}
              required
              className="text-center text-lg tracking-[0.4em]"
              value={code}
              onChange={(event) => {
                const next = useBackupCode
                  ? event.target.value.trim()
                  : event.target.value.replace(/\D/g, '');
                setCode(next.slice(0, expectedLength));
              }}
            />
          </Field>

          <div className="flex items-start gap-2">
            <Checkbox
              id="trustDevice"
              className="mt-0.5"
              checked={trustDevice}
              onChange={(event) => {
                setTrustDevice(event.target.checked);
              }}
            />
            <label htmlFor="trustDevice" className="text-sm">
              Don&rsquo;t ask again on this device for 30 days.
              <span className="block">
                Only tick this on a device that is yours and that other people cannot use.
              </span>
            </label>
          </div>

          <Button
            type="submit"
            color="primary"
            disabled={busy || code.length < expectedLength}
            loading={pending === 'twoFactor'}
          >
            Verify and sign in
          </Button>

          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={busy}
            onClick={() => {
              setUseBackupCode((prev) => !prev);
              setCode('');
              setError(null);
            }}
          >
            {useBackupCode
              ? 'Use my authenticator app instead'
              : 'I don’t have my phone — use a backup code'}
          </Button>
        </form>
      </AuthShell>
    );
  }

  // ── Magic-link-sent view ─────────────────────────────────────────────────────
  if (view === 'linkSent') {
    return (
      <AuthShell tabs={[{ id: 'link', label: 'Check your email', icon: Mail }]} activeTab="link">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Your sign-in link is on its way</h2>
            <Text className="text-sm">
              We emailed a sign-in link to <span className="font-medium">{email}</span>. Open it on
              this device and you&rsquo;ll be signed straight in — the link works once and expires
              in 15 minutes.
            </Text>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              setView('form');
            }}
          >
            Use a different method
          </Button>
        </div>
      </AuthShell>
    );
  }

  // ── Forgot-password request view ─────────────────────────────────────────────
  if (view === 'forgotPassword') {
    return (
      <AuthShell
        tabs={[{ id: 'reset', label: 'Reset password', icon: KeyRound }]}
        activeTab="reset"
      >
        <form onSubmit={onSendReset} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Reset your password</h2>
            <Text className="text-sm">
              Enter the email tied to your account and we&rsquo;ll send a link to set a new one.
            </Text>
          </div>

          {error ? (
            <Alert color="danger" variant="soft" role="alert">
              {error}
            </Alert>
          ) : null}

          <Field>
            <FieldLabel>Email</FieldLabel>
            <FieldControl
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </Field>

          <Button type="submit" color="primary" disabled={busy} loading={pending === 'reset'}>
            Send reset link
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={busy}
            onClick={() => {
              setError(null);
              setView('form');
            }}
          >
            Back to sign in
          </Button>
        </form>
      </AuthShell>
    );
  }

  // ── Reset-link-sent view ─────────────────────────────────────────────────────
  if (view === 'resetSent') {
    return (
      <AuthShell
        tabs={[{ id: 'reset', label: 'Reset password', icon: KeyRound }]}
        activeTab="reset"
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold">Check your email</h2>
            <Text className="text-sm">
              If an account exists for <span className="font-medium">{email}</span>, a
              password-reset link is on its way. It expires in an hour — check your spam folder if
              you don&rsquo;t see it.
            </Text>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setError(null);
              setView('form');
            }}
          >
            Back to sign in
          </Button>
        </div>
      </AuthShell>
    );
  }

  // ── Main method card ─────────────────────────────────────────────────────────
  return (
    <AuthShell
      tabs={[
        { id: 'signIn', label: 'Sign in', icon: LogIn },
        { id: 'signUp', label: 'Create account', icon: UserPlus },
      ]}
      activeTab={mode}
      onSelect={(id) => {
        switchMode(id as Mode);
      }}
    >
      {googleClientId ? (
        <GoogleOneTap clientId={googleClientId} onError={setError} callbackURL={callbackURL} />
      ) : null}

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">
            {isSignUp ? 'Start your story' : 'Welcome back'}
          </h2>
          <Text className="text-sm">
            {isSignUp
              ? 'Your story, multiplied — create your account and you’ll be up and running in minutes.'
              : 'Sign in to pick up exactly where you left off.'}
          </Text>
        </div>

        {error ? (
          <Alert color="danger" variant="soft" role="alert">
            {error}
          </Alert>
        ) : null}

        {isSignUp ? <LegalAgreement checked={agreeLegal} onChange={setAgreeLegal} /> : null}

        <GoogleButton onError={setError} disabled={createBlocked} callbackURL={callbackURL} />
        <AuthDivider />

        <form onSubmit={onPasswordSubmit} className="flex flex-col gap-4">
          {isSignUp ? (
            <Field>
              <FieldLabel>Your name</FieldLabel>
              <FieldControl
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
            </Field>
          ) : null}

          <Field>
            <FieldLabel>Email</FieldLabel>
            <FieldControl
              type="email"
              // `webauthn` lets the browser offer an enrolled passkey inline (the
              // conditional-UI arm in the effect above).
              autoComplete={isSignUp ? 'email' : 'email webauthn'}
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          </Field>

          <Field>
            <div className="flex items-center justify-between gap-4">
              <FieldLabel>Password</FieldLabel>
              {isSignUp ? null : (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setError(null);
                    setView('forgotPassword');
                  }}
                >
                  Forgot password?
                </Button>
              )}
            </div>
            <FieldControl
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              render={<PasswordInput />}
            />
            {isSignUp ? (
              <FieldDescription>At least {MIN_PASSWORD} characters.</FieldDescription>
            ) : null}
          </Field>

          <Button
            type="submit"
            color="primary"
            disabled={busy || createBlocked}
            loading={pending === 'password'}
          >
            {isSignUp ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        {/* Passwordless + passkey alternatives — every method on one screen. */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || createBlocked}
              loading={pending === 'sendCode'}
              onClick={() => void onSendCode()}
            >
              Email me a code
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || createBlocked}
              loading={pending === 'link'}
              onClick={() => void onSendLink()}
            >
              Email me a link
            </Button>
          </div>
          {isSignUp ? null : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              loading={pending === 'passkey'}
              onClick={() => void onPasskey()}
            >
              <span className="inline-flex items-center gap-2">
                <KeyRound className="size-4" aria-hidden />
                Use a passkey
              </span>
            </Button>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
