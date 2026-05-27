import { auth } from '@sparx/auth';
import { toNextJsHandler } from 'better-auth/next-js';

// Better Auth catches every /api/auth/* request: sign-in, sign-up, magic links,
// session lookup, etc. Mounting here means the client SDK (better-auth/react
// inside @sparx/auth/client) needs no baseURL config.
export const { POST, GET } = toNextJsHandler(auth);
