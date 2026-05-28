// Low-level transport. Every higher-level helper (cms, media, etc.)
// builds on `request()` — keep the auth/envelope/retry policy here so
// downstream callers can't forget it.

import { ApiError, type Envelope, type EnvelopeError } from './envelope.js';

export interface SparxClientOptions {
  /** Base URL of api-rest, e.g. https://api.sparx.works. No trailing slash. */
  baseUrl: string;
  /**
   * Auth token. Either a Better-Auth-issued internal JWT (`Bearer <jwt>`)
   * or a `sparx_live_*` / `sparx_test_*` API key. Pass a function if you
   * need lazy resolution (refresh tokens, env-late binding).
   */
  token?: string | (() => string | Promise<string>);
  /**
   * Preview-token resolver. When the consumer is a storefront forwarding
   * a `?sparxPreview=` query string, return the token here and the client
   * will send it as `Authorization: Preview <jwt>` for public read calls.
   */
  previewToken?: string | (() => string | Promise<string | undefined> | undefined);
  /** Custom fetch — default global fetch. */
  fetch?: typeof fetch;
  /** Default request timeout (ms). Default 30s. */
  timeoutMs?: number;
  /** User-Agent override. Defaults to "sparx-api-client/<version>". */
  userAgent?: string;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Send as `Authorization: Preview <jwt>` instead of `Bearer`. */
  preview?: boolean;
  /** Idempotency key — surfaces as `Idempotency-Key`. */
  idempotencyKey?: string;
  /** ETag of the row being mutated, sent as `If-Match`. */
  ifMatch?: string;
  /** Override the default timeout for this call. */
  timeoutMs?: number;
  /** Return raw Response (e.g. for `/sitemap.xml`). */
  raw?: boolean;
}

export interface ResponseMeta {
  status: number;
  headers: Headers;
  etag?: string;
  requestId?: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: ResponseMeta;
}

function buildQuery(params: RequestOptions['query']): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export class SparxClient {
  private readonly baseUrl: string;
  private readonly tokenSrc?: SparxClientOptions['token'];
  private readonly previewSrc?: SparxClientOptions['previewToken'];
  private readonly _fetch: typeof fetch;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  constructor(opts: SparxClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.tokenSrc = opts.token;
    this.previewSrc = opts.previewToken;
    this._fetch = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.userAgent = opts.userAgent ?? 'sparx-api-client/0.0.0';
  }

  private async resolveToken(): Promise<string | undefined> {
    if (!this.tokenSrc) return undefined;
    return typeof this.tokenSrc === 'function' ? await this.tokenSrc() : this.tokenSrc;
  }

  private async resolvePreviewToken(): Promise<string | undefined> {
    if (!this.previewSrc) return undefined;
    return typeof this.previewSrc === 'function' ? await this.previewSrc() : this.previewSrc;
  }

  async request<T>(options: RequestOptions): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${options.path}${buildQuery(options.query)}`;
    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    headers.set('User-Agent', this.userAgent);

    if (options.preview) {
      const pt = await this.resolvePreviewToken();
      if (pt) headers.set('Authorization', `Preview ${pt}`);
    } else {
      const token = await this.resolveToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
    if (options.ifMatch) headers.set('If-Match', options.ifMatch);

    let body: BodyInit | undefined;
    if (options.body !== undefined && options.body !== null) {
      if (options.body instanceof FormData || options.body instanceof Blob) {
        body = options.body;
      } else {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(options.body);
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, options.timeoutMs ?? this.timeoutMs);

    let res: Response;
    try {
      res = await this._fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (options.raw) {
      // Caller wants the raw response (XML, redirects, streaming). They
      // own status handling. We still propagate ApiError for clean 4xx/5xx
      // when the body is the standard envelope.
      if (!res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const errBody = (await res.json()) as EnvelopeError;
        throw new ApiError(res.status, errBody);
      }
      return {
        data: res as unknown as T,
        meta: this.metaFromResponse(res),
      };
    }

    const isJson = res.headers.get('content-type')?.includes('application/json');
    if (res.status === 204) {
      return { data: undefined as T, meta: this.metaFromResponse(res) };
    }
    if (!isJson) {
      throw new ApiError(res.status, {
        success: false,
        error: {
          code: 'NON_JSON_RESPONSE',
          message: `Expected JSON, got ${res.headers.get('content-type') ?? 'unknown'}`,
          request_id: res.headers.get('x-request-id') ?? 'unknown',
        },
      });
    }

    const payload = (await res.json()) as Envelope<T>;
    if (!payload.success) {
      throw new ApiError(res.status, payload);
    }

    return {
      data: payload.data,
      meta: this.metaFromResponse(res),
    };
  }

  private metaFromResponse(res: Response): ResponseMeta {
    return {
      status: res.status,
      headers: res.headers,
      etag: res.headers.get('etag') ?? undefined,
      requestId: res.headers.get('x-request-id') ?? undefined,
    };
  }
}
