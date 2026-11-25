import 'server-only';
import { decodeJwt } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { StaffUser } from './types';

export const SESSION_COOKIE = 'cb_session';

export async function getToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function getUser(): Promise<StaffUser | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    const claims = decodeJwt(token);
    if (!claims.sub || (claims.exp && claims.exp * 1000 < Date.now())) return null;
    return { id: claims.sub, name: String(claims.name), email: String(claims.email), role: claims.role as StaffUser['role'] };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<StaffUser> {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}
