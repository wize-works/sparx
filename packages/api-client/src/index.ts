// @sparx/api-client — TypeScript SDK for the Sparx public REST API.
//
// Quick start:
//
//   import { Sparx } from '@sparx/api-client';
//   const sparx = new Sparx({
//     baseUrl: 'https://api.sparx.works',
//     token: process.env.SPARX_API_KEY!,
//   });
//   const { data, meta } = await sparx.cms.getEntryBySlug('blog_post', 'hello');
//
// For storefronts handling a `?sparxPreview=` query, pass `previewToken`:
//
//   const sparx = new Sparx({ baseUrl, previewToken: () => req.query.preview });
//   const post = await sparx.cms.getEntryBySlug('blog_post', slug, { preview: true });
//
// Conventions match docs/06-api-specification.md:
//   - All responses use the {success, data, meta?} envelope; the client
//     unwraps and throws ApiError on {success: false}.
//   - Mutations support Idempotency-Key + If-Match passthrough.
//   - ETag is exposed on `meta.etag` so callers can plumb optimistic
//     concurrency without inspecting headers.

import { SparxClient, type SparxClientOptions } from './client.js';
import { CmsApi } from './cms.js';
import { MediaApi } from './media.js';
import { GraphQLClient } from './graphql.js';

export interface SparxOptions extends SparxClientOptions {
  /**
   * Override the base URL used for GraphQL operations. Defaults to the
   * same `baseUrl` REST uses (Caddy host-routes /v1/graphql to api-graphql).
   * Set this to `https://graphql.sparx.works` if you want the dedicated
   * GraphQL hostname directly.
   */
  graphqlBaseUrl?: string;
}

export class Sparx {
  public readonly client: SparxClient;
  public readonly cms: CmsApi;
  public readonly media: MediaApi;
  public readonly graphql: GraphQLClient;

  constructor(opts: SparxOptions) {
    this.client = new SparxClient(opts);
    this.cms = new CmsApi(this.client);
    this.media = new MediaApi(this.client);
    this.graphql = new GraphQLClient({
      baseUrl: opts.graphqlBaseUrl ?? opts.baseUrl,
      token: opts.token,
      fetch: opts.fetch,
    });
  }
}

export { SparxClient, type SparxClientOptions } from './client.js';
export { ApiError, type Envelope } from './envelope.js';
export type {
  ContentEntry,
  ContentEntryListItem,
  ContentEntrySeo,
  ContentRevision,
  ContentTypeMeta,
  EntryStatus,
  MediaAsset,
  MediaVariant,
  NavigationItem,
  NavigationMenu,
  PageMeta,
  Redirect,
} from './types.js';
export { CmsApi } from './cms.js';
export { MediaApi } from './media.js';
export {
  GraphQLClient,
  type GraphQLClientOptions,
  type GraphQLOperation,
  type GraphQLError,
  type GraphQLResponse,
} from './graphql.js';
export type {
  CreateEntryInput,
  ListEntriesQuery,
  PreviewTokenResponse,
  PublishEntryInput,
  UpdateEntryInput,
} from './cms.js';
export type { InitUploadInput, PresignedUpload, UpdateMediaAssetInput } from './media.js';
