// GraphQL transport — a thin wrapper that posts to /v1/graphql.
//
// Kept separate from CmsApi/MediaApi (the REST helpers) because GraphQL
// lives on a sibling service (api-graphql) reached either via
// graphql.sparx.works or, in cluster, via the api-graphql svc. The Sparx
// constructor lets consumers set a different baseUrl for GraphQL if they
// want to address it directly; by default it falls back to the same base
// URL as REST (which Caddy routes via host match).

import { ApiError } from './envelope.js';

export interface GraphQLClientOptions {
  baseUrl: string;
  token?: string | (() => string | Promise<string>);
  fetch?: typeof fetch;
  /**
   * Override the GraphQL path. Defaults to `/v1/graphql`. Useful for
   * tests that mount the schema at a different mount point.
   */
  path?: string;
}

export interface GraphQLOperation<TVariables = Record<string, unknown>> {
  query: string;
  variables?: TVariables;
  operationName?: string;
}

export interface GraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
}

export interface GraphQLResponse<TData> {
  data?: TData;
  errors?: GraphQLError[];
}

export class GraphQLClient {
  private readonly url: string;
  private readonly tokenSrc?: GraphQLClientOptions['token'];
  private readonly _fetch: typeof fetch;

  constructor(opts: GraphQLClientOptions) {
    const path = opts.path ?? '/v1/graphql';
    this.url = `${opts.baseUrl.replace(/\/+$/, '')}${path}`;
    this.tokenSrc = opts.token;
    this._fetch = opts.fetch ?? fetch;
  }

  /**
   * Execute a GraphQL operation. Throws if the network call fails or if
   * the response contains `errors` — the typed `data` is the happy-path
   * result. Pass `partial: true` to suppress the throw and inspect
   * partial-data + errors together.
   */
  async query<TData, TVariables = Record<string, unknown>>(
    op: GraphQLOperation<TVariables>,
    options: { partial?: boolean } = {}
  ): Promise<GraphQLResponse<TData>> {
    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    if (this.tokenSrc) {
      const token = typeof this.tokenSrc === 'function' ? await this.tokenSrc() : this.tokenSrc;
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await this._fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(op),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new ApiError(res.status, {
        success: false,
        error: {
          code: 'GRAPHQL_TRANSPORT_ERROR',
          message: text || `GraphQL transport returned ${res.status}`,
          request_id: res.headers.get('x-request-id') ?? 'unknown',
        },
      });
    }

    const payload = (await res.json()) as GraphQLResponse<TData>;

    if (payload.errors?.length && !options.partial) {
      const first = payload.errors[0];
      throw new ApiError(200, {
        success: false,
        error: {
          code: (first?.extensions?.code as string) ?? 'GRAPHQL_ERROR',
          message: first?.message ?? 'GraphQL operation failed.',
          request_id: res.headers.get('x-request-id') ?? 'unknown',
          details: payload.errors,
        },
      });
    }

    return payload;
  }
}
