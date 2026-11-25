'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

export function LoginForm({ expired }: { expired: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const message = state.error ?? (expired ? 'Your session ended. Log in again to continue.' : undefined);

  return (
    <form action={action} className="space-y-5">
      <label className="block">
        <span className="text-sm font-medium">Work email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className="mt-1.5 block w-full rounded-md border border-line bg-white px-3 py-2.5 text-base outline-none focus:border-ink"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1.5 block w-full rounded-md border border-line bg-white px-3 py-2.5 text-base outline-none focus:border-ink"
        />
      </label>
      {message && (
        <p role="alert" className="rounded-md bg-signal-soft px-3 py-2 text-sm text-signal">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-ink px-4 py-2.5 font-semibold text-white hover:bg-ink-soft disabled:opacity-60"
      >
        {pending ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}
