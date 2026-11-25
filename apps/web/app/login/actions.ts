'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { SESSION_COOKIE } from '@/lib/session';

export interface LoginState {
  error?: string;
  email?: string;
}

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password) return { error: 'Enter your email and password.', email };

  let res: Response;
  try {
    res = await apiFetch('/staff/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false);
  } catch {
    return { error: "Can't reach the claims API. Check that it is running and API_URL is correct.", email };
  }
  if (res.status === 401) return { error: 'That email and password don’t match a staff account.', email };
  if (!res.ok) return { error: `Login failed (${res.status}). Try again.`, email };

  const { token } = (await res.json()) as { token: string };
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 12 * 60 * 60,
  });
  redirect('/claims');
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
