import 'server-only';
import { redirect } from 'next/navigation';
import { getToken } from './session';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { message?: string | string[] };
    return Array.isArray(body.message) ? body.message.join('; ') : (body.message ?? text);
  } catch {
    return text || res.statusText;
  }
}

export async function apiFetch(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
  const token = auth ? await getToken() : undefined;
  if (auth && !token) redirect('/login');
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401 && auth) redirect('/login?expired=1');
  return res;
}

export async function api<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
  const res = await apiFetch(path, init, auth);
  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return (await res.json()) as T;
}
