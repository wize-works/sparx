// Single error-handling plugin. Every thrown error — ours, Fastify's,
// Zod's, or anything unexpected — funnels through here and exits as the
// `{ success: false, error: { code, message, details?, request_id } }`
// envelope described in docs/06-api-specification.md §3.

import type { FastifyError, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { ApiError } from '../errors.js';

interface ErrorEnvelope {
    success: false;
    error: {
        code: string;
        message: string;
        details?: unknown;
        request_id: string;
    };
}

const errorsPlugin: FastifyPluginAsync = (app) => {
    app.setErrorHandler((err: FastifyError, request, reply) => {
        const requestId = request.id;

        if (err instanceof ApiError) {
            const body: ErrorEnvelope = {
                success: false,
                error: {
                    code: err.code,
                    message: err.message,
                    ...(err.details !== undefined ? { details: err.details } : {}),
                    request_id: requestId,
                },
            };
            return reply.code(err.statusCode).send(body);
        }

        if (err instanceof ZodError) {
            const body: ErrorEnvelope = {
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Request validation failed.',
                    details: err.issues.map((i) => ({
                        path: i.path.join('.'),
                        message: i.message,
                        code: i.code,
                    })),
                    request_id: requestId,
                },
            };
            return reply.code(422).send(body);
        }

        // Fastify's built-in schema validation surfaces as a FastifyError with
        // `validation` and statusCode 400 — map it to the same VALIDATION_ERROR
        // shape so callers don't have to special-case it.
        if (err.statusCode === 400 && Array.isArray(err.validation)) {
            const body: ErrorEnvelope = {
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: err.message,
                    details: err.validation,
                    request_id: requestId,
                },
            };
            return reply.code(400).send(body);
        }

        if (err.statusCode === 401) {
            return reply.code(401).send({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: err.message || 'Authentication required.',
                    request_id: requestId,
                },
            } satisfies ErrorEnvelope);
        }

        if (err.statusCode === 429) {
            return reply.code(429).send({
                success: false,
                error: {
                    code: 'RATE_LIMITED',
                    message: err.message || 'Too many requests.',
                    request_id: requestId,
                },
            } satisfies ErrorEnvelope);
        }

        // Anything else is a bug. Log the full error server-side; return a
        // generic message client-side. The request_id lets us look it up.
        request.log.error({ err }, 'unhandled error');
        return reply.code(500).send({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'An internal error occurred.',
                request_id: requestId,
            },
        } satisfies ErrorEnvelope);
    });

    app.setNotFoundHandler((request, reply) => {
        reply.code(404).send({
            success: false,
            error: {
                code: 'NOT_FOUND',
                message: `Route ${request.method} ${request.url} not found.`,
                request_id: request.id,
            },
        } satisfies ErrorEnvelope);
    });
    return Promise.resolve();
};

// Wrap with fastify-plugin so setErrorHandler + setNotFoundHandler apply to
// the parent (root) scope rather than only the encapsulated child scope.
// Without this, errors thrown from sibling plugins fall through to
// Fastify's default error response shape and bypass our envelope.
export default fp(errorsPlugin, { name: 'envelope-errors' });
