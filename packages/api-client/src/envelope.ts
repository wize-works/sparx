// Response envelope mirror.
//
// api-rest always returns one of these shapes (docs/06-api-specification.md
// §3). The client unwraps `success: true` payloads to the inner `data`,
// throws `ApiError` on `success: false`. Keep these types in lockstep with
// services/api-rest/src/lib/envelope.ts — they're duplicated here only so
// this package has no api-rest dependency.

export interface EnvelopeSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface EnvelopeError {
  success: false;
  error: {
    code: string;
    message: string;
    request_id: string;
    details?: unknown;
  };
}

export type Envelope<T> = EnvelopeSuccess<T> | EnvelopeError;

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly requestId: string;
  public readonly details: unknown;

  constructor(status: number, body: EnvelopeError) {
    super(body.error.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error.code;
    this.requestId = body.error.request_id;
    this.details = body.error.details;
  }
}
