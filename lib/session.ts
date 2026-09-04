import { cookies } from 'next/headers';
import {
    SESSION_COOKIE,
    createSessionToken,
    sessionCookieOptions,
    verifySessionToken,
    type Role,
} from './auth';
import { getUser, type UserSummary } from './db';

/**
 * The user behind the session cookie, for server components and route handlers. The proxy has already checked the signature; this module reads the row, so a deleted user is logged out on the next request even with a valid cookie.
 */

export type CurrentUser = UserSummary;

/** Turned into the matching HTTP status by `apiHandler`. */
export class AuthError extends Error {
    constructor(
        readonly status: 401 | 403,
        message: string,
    ) {
        super(message);
        this.name = 'AuthError';
    }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const claims = await verifySessionToken(token);
    if (!claims) return null;
    return getUser(claims.userId);
}

export async function requireUser(): Promise<CurrentUser> {
    const user = await getCurrentUser();
    if (!user) throw new AuthError(401, 'Authentication required');
    return user;
}

const RANK: Record<Role, number> = { viewer: 0, admin: 1 };

/** The single place roles are checked: mutating routes call `requireRole('admin')`. */
export async function requireRole(role: Role): Promise<CurrentUser> {
    const user = await requireUser();
    if ((RANK[user.role as Role] ?? -1) < RANK[role]) {
        throw new AuthError(403, 'Insufficient permissions');
    }
    return user;
}

/** Writes the session cookie for the response being built. */
export async function openSession(user: Pick<UserSummary, 'id' | 'role'>): Promise<void> {
    const token = await createSessionToken({ userId: user.id, role: user.role as Role });
    (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function closeSession(): Promise<void> {
    (await cookies()).set(SESSION_COOKIE, '', sessionCookieOptions(0));
}
