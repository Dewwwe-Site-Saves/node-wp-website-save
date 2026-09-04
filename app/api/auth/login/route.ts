import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { apiHandler, jsonError, parseBody } from '@/lib/api';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { findUserByEmail, touchLastLogin } from '@/lib/db';
import { clientAddress, recordFailure, recordSuccess, retryAfterMs } from '@/lib/login-throttle';
import { openSession } from '@/lib/session';
import { loginSchema } from '@/lib/validation';

// An unknown email still costs one bcrypt comparison, so the response time does not tell emails apart.
let decoyHash: Promise<string> | undefined;

export const POST = apiHandler(async (request: Request) => {
    const address = clientAddress(request);
    const wait = retryAfterMs(address);
    if (wait > 0) {
        return NextResponse.json(
            { error: 'Too many attempts, try again later' },
            { status: 429, headers: { 'Retry-After': String(Math.ceil(wait / 1000)) } },
        );
    }

    const { data, response } = await parseBody(request, loginSchema);
    if (response) return response;

    const user = await findUserByEmail(data.email);
    const hash =
        user?.passwordHash ?? (await (decoyHash ??= hashPassword(randomBytes(16).toString('hex'))));
    const valid = await verifyPassword(data.password, hash);
    if (!user || !valid) {
        recordFailure(address);
        return jsonError(401, 'Invalid email or password');
    }

    recordSuccess(address);
    await openSession(user);
    await touchLastLogin(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
});
