import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Passwords and session tokens, with no database or Next.js import: the proxy verifies the cookie on every request from this module alone. Loading the user behind a session lives in `session.ts`.
 */

/** `viewer` is reserved for the multi-user feature: every user is an `admin` until then. */
export const ROLES = ['admin', 'viewer'] as const;

export type Role = (typeof ROLES)[number];

export const SESSION_COOKIE = 'wpbm_session';
/** Seven days, refreshed at every login only. */
export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

const BCRYPT_ROUNDS = 12;
const JWT_ALG = 'HS256';

export interface SessionClaims {
    userId: number;
    role: Role;
}

// ============ Passwords ============

export function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// ============ Session tokens ============

function secretKey(): Uint8Array {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        throw new Error('SESSION_SECRET is not set (generate it with: openssl rand -hex 32)');
    }
    return new TextEncoder().encode(secret);
}

/** Signed JWT carrying the user id and role. Throws when `SESSION_SECRET` is missing. */
export async function createSessionToken(
    claims: SessionClaims,
    maxAgeSeconds = SESSION_MAX_AGE_S,
): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ role: claims.role })
        .setProtectedHeader({ alg: JWT_ALG })
        .setSubject(String(claims.userId))
        .setIssuedAt(now)
        .setExpirationTime(now + maxAgeSeconds)
        .sign(secretKey());
}

/** Null for anything but a token signed with the current secret and not expired: a bad cookie is simply "not logged in". */
export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
    try {
        const { payload } = await jwtVerify(token, secretKey(), { algorithms: [JWT_ALG] });
        const userId = Number(payload.sub);
        const role = payload.role;
        if (!Number.isInteger(userId) || userId <= 0) return null;
        if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) return null;
        return { userId, role: role as Role };
    } catch {
        return null;
    }
}

// ============ Cookie ============

export interface SessionCookieOptions {
    httpOnly: true;
    sameSite: 'lax';
    secure: boolean;
    path: '/';
    maxAge: number;
}

/** `secure` follows `NODE_ENV`; `SESSION_COOKIE_SECURE=false` allows a production instance served over plain HTTP on a LAN. */
export function sessionCookieOptions(maxAge = SESSION_MAX_AGE_S): SessionCookieOptions {
    const override = process.env.SESSION_COOKIE_SECURE;
    const secure =
        override !== undefined ? override !== 'false' : process.env.NODE_ENV === 'production';
    return { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge };
}
