import { NextResponse } from 'next/server';
import type { ZodError, ZodType } from 'zod';
import { errorMessage } from './engine/cancel';
import { AuthError } from './session';

/** Every API error has the same shape: `{ error: string }`, plus `issues` for validation. */
export function jsonError(
    status: number,
    error: string,
    extra?: Record<string, unknown>,
): NextResponse {
    return NextResponse.json({ error, ...extra }, { status });
}

export function validationError(error: ZodError): NextResponse {
    const issues = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
    }));
    const first = issues[0];
    return jsonError(400, first ? `${first.path || 'input'}: ${first.message}` : 'Invalid input', {
        issues,
    });
}

/** Parses and validates a JSON body. An empty body is `{}`, so schemas made of defaults accept a bare POST. Returns either the data or the error response to send. */
export async function parseBody<T>(
    request: Request,
    schema: ZodType<T>,
): Promise<{ data: T; response?: never } | { data?: never; response: NextResponse }> {
    let raw: unknown;
    try {
        const text = await request.text();
        raw = text.trim() ? JSON.parse(text) : {};
    } catch {
        return { response: jsonError(400, 'Invalid JSON body') };
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
        return { response: validationError(parsed.error) };
    }
    return { data: parsed.data };
}

/** Wraps a route handler: `AuthError` becomes its status, anything else a 500 without the internal message. */
export function apiHandler<Args extends unknown[]>(
    handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
    return async (...args) => {
        try {
            return await handler(...args);
        } catch (error) {
            if (error instanceof AuthError) return jsonError(error.status, error.message);
            console.error(`[api] ${errorMessage(error)}`);
            return jsonError(500, 'Internal server error');
        }
    };
}
