import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createSessionToken,
    hashPassword,
    sessionCookieOptions,
    verifyPassword,
    verifySessionToken,
} from './auth';

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
    for (const name of ['SESSION_SECRET', 'SESSION_COOKIE_SECURE']) {
        savedEnv[name] = process.env[name];
    }
    process.env.SESSION_SECRET = 'test-secret-'.repeat(4);
});

afterEach(() => {
    vi.unstubAllEnvs();
    for (const [name, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

describe('passwords', () => {
    it('verifies the password against its hash and nothing else', async () => {
        const hash = await hashPassword('correct horse battery');
        expect(hash).not.toContain('correct horse');
        expect(await verifyPassword('correct horse battery', hash)).toBe(true);
        expect(await verifyPassword('correct horse batter', hash)).toBe(false);
    });
});

describe('session tokens', () => {
    it('round-trips the user id and role', async () => {
        const token = await createSessionToken({ userId: 42, role: 'admin' });
        expect(await verifySessionToken(token)).toEqual({ userId: 42, role: 'admin' });
    });

    it('rejects a tampered token', async () => {
        const token = await createSessionToken({ userId: 42, role: 'admin' });
        const [header, payload, signature] = token.split('.');
        const forged = Buffer.from(JSON.stringify({ sub: '1', role: 'admin' })).toString(
            'base64url',
        );
        expect(await verifySessionToken(`${header}.${forged}.${signature}`)).toBeNull();
        expect(await verifySessionToken(`${header}.${payload}.`)).toBeNull();
        expect(await verifySessionToken('garbage')).toBeNull();
    });

    it('rejects a token signed with another secret', async () => {
        const token = await createSessionToken({ userId: 42, role: 'admin' });
        process.env.SESSION_SECRET = 'another-secret-'.repeat(3);
        expect(await verifySessionToken(token)).toBeNull();
    });

    it('rejects an expired token', async () => {
        const token = await createSessionToken({ userId: 42, role: 'admin' }, -60);
        expect(await verifySessionToken(token)).toBeNull();
    });

    it('rejects an unknown role', async () => {
        const token = await createSessionToken({ userId: 42, role: 'root' as 'admin' });
        expect(await verifySessionToken(token)).toBeNull();
    });

    it('refuses to sign without a secret and verifies nothing', async () => {
        delete process.env.SESSION_SECRET;
        await expect(createSessionToken({ userId: 1, role: 'admin' })).rejects.toThrow(
            'SESSION_SECRET',
        );
        expect(await verifySessionToken('a.b.c')).toBeNull();
    });
});

describe('sessionCookieOptions', () => {
    it('is secure in production unless overridden', () => {
        vi.stubEnv('NODE_ENV', 'production');
        delete process.env.SESSION_COOKIE_SECURE;
        expect(sessionCookieOptions().secure).toBe(true);
        process.env.SESSION_COOKIE_SECURE = 'false';
        expect(sessionCookieOptions().secure).toBe(false);
    });

    it('is not secure in development by default', () => {
        vi.stubEnv('NODE_ENV', 'development');
        delete process.env.SESSION_COOKIE_SECURE;
        expect(sessionCookieOptions()).toMatchObject({
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            path: '/',
        });
    });
});
