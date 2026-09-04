import { NextResponse } from 'next/server';
import type { ZodError, ZodType } from 'zod';

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

/** Parses and validates a JSON body. Returns either the data or the error response to send. */
export async function parseBody<T>(
    request: Request,
    schema: ZodType<T>,
): Promise<{ data: T; response?: never } | { data?: never; response: NextResponse }> {
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return { response: jsonError(400, 'Invalid JSON body') };
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
        return { response: validationError(parsed.error) };
    }
    return { data: parsed.data };
}
