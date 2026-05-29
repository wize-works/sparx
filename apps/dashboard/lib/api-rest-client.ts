// Server-side client for talking to services/api-rest from the dashboard.
//
// Every call requires an authenticated staff session. We sign a short-lived
// HS256 JWT carrying {sub, tid, role} using the shared
// SPARX_INTERNAL_JWT_SECRET; api-rest verifies it with the same secret. The
// dashboard never exposes the secret or the token to the browser — all calls
// happen from server components or server actions.
//
// Responses are unwrapped: success returns `data`; non-2xx throws an
// ApiRestError carrying the envelope's `code` + `message` so the calling
// server action can surface the friendly message in the dashboard UI.

import { SignJWT } from 'jose';
import { requireSession, type SparxSession } from '@sparx/auth';

const BASE_URL = process.env.SPARX_API_REST_URL ?? 'http://localhost:3100';
const encoder = new TextEncoder();

function getSecret(): Uint8Array {
  const secret = process.env.SPARX_INTERNAL_JWT_SECRET;
  if (!secret) {
    throw new Error('SPARX_INTERNAL_JWT_SECRET is required to call api-rest.');
  }
  return encoder.encode(secret);
}

async function signToken(session: SparxSession): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    tid: session.user.tenantId,
    role: session.user.role,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(session.user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .sign(getSecret());
}

export interface ApiRestError extends Error {
  code: string;
  status: number;
  details?: unknown;
  requestId?: string;
}

function makeError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
  requestId?: string
): ApiRestError {
  const err = new Error(message) as ApiRestError;
  err.code = code;
  err.status = status;
  err.details = details;
  err.requestId = requestId;
  return err;
}

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta?: unknown;
}

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id?: string;
  };
}

export interface CallOptions {
  ifMatch?: string;
}

export interface ResponseEnvelope<T> {
  data: T;
  etag: string | null;
}

async function call<T>(
  session: SparxSession,
  method: string,
  path: string,
  body?: unknown,
  options: CallOptions = {}
): Promise<ResponseEnvelope<T>> {
  const token = await signToken(session);
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (options.ifMatch) headers['if-match'] = options.ifMatch;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const etag = res.headers.get('etag');

  if (res.status === 204) {
    return { data: undefined as T, etag };
  }

  const json = (await res.json()) as SuccessEnvelope<T> | ErrorEnvelope;

  if (!res.ok) {
    if ('error' in json) {
      throw makeError(
        res.status,
        json.error.code,
        json.error.message,
        json.error.details,
        json.error.request_id
      );
    }
    throw makeError(res.status, 'UNKNOWN', `api-rest ${res.status}`);
  }
  return { data: (json as SuccessEnvelope<T>).data, etag };
}

async function withSession<T>(fn: (session: SparxSession) => Promise<T>): Promise<T> {
  const session = await requireSession();
  return fn(session);
}

export const api = {
  get: async <T>(path: string): Promise<T> =>
    withSession(async (s) => (await call<T>(s, 'GET', path)).data),
  getWithEtag: async <T>(path: string): Promise<ResponseEnvelope<T>> =>
    withSession((s) => call<T>(s, 'GET', path)),
  post: async <T>(path: string, body?: unknown): Promise<T> =>
    withSession(async (s) => (await call<T>(s, 'POST', path, body)).data),
  patch: async <T>(path: string, body?: unknown, options?: CallOptions): Promise<T> =>
    withSession(async (s) => (await call<T>(s, 'PATCH', path, body, options)).data),
  put: async <T>(path: string, body?: unknown): Promise<T> =>
    withSession(async (s) => (await call<T>(s, 'PUT', path, body)).data),
  patchWithEtag: async <T>(
    path: string,
    body?: unknown,
    options?: CallOptions
  ): Promise<ResponseEnvelope<T>> => withSession((s) => call<T>(s, 'PATCH', path, body, options)),
  delete: async <T>(path: string): Promise<T> =>
    withSession(async (s) => (await call<T>(s, 'DELETE', path)).data),
};
