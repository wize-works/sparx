// Shared error class. Throwing one of these from any route handler produces
// the canonical envelope shape defined in docs/06-api-specification.md §3
// (Error Response). The error handler plugin maps everything else (Zod,
// Fastify validation, unknown) to the same envelope so callers can rely on
// a single response shape.

export type ApiErrorCode =
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'CONFLICT'
    | 'RATE_LIMITED'
    | 'INTERNAL_ERROR'
    | 'BAD_REQUEST';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    VALIDATION_ERROR: 422,
    RATE_LIMITED: 429,
    INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
    public readonly code: ApiErrorCode;
    public readonly statusCode: number;
    public readonly details: unknown;

    constructor(code: ApiErrorCode, message: string, details?: unknown) {
        super(message);
        this.code = code;
        this.statusCode = STATUS_BY_CODE[code];
        this.details = details;
        this.name = 'ApiError';
    }
}

// Convenience factories for the common cases. Keep the route handler call
// site readable: `throw notFound('content type', key)` reads better than
// `throw new ApiError('NOT_FOUND', \`Content type ${key} not found\`)`.

export const unauthorized = (message = 'Authentication required.'): ApiError =>
    new ApiError('UNAUTHORIZED', message);

export const forbidden = (message = 'Not allowed.'): ApiError => new ApiError('FORBIDDEN', message);

export const notFound = (entity: string, identifier?: string): ApiError =>
    new ApiError(
        'NOT_FOUND',
        identifier ? `${entity} "${identifier}" not found.` : `${entity} not found.`
    );

export const conflict = (message: string, details?: unknown): ApiError =>
    new ApiError('CONFLICT', message, details);

export const validationError = (message: string, details?: unknown): ApiError =>
    new ApiError('VALIDATION_ERROR', message, details);

export const badRequest = (message: string, details?: unknown): ApiError =>
    new ApiError('BAD_REQUEST', message, details);
