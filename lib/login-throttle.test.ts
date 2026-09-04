import { describe, expect, it } from 'vitest';
import {
    MAX_FAILURES,
    WINDOW_MS,
    clientAddress,
    recordFailure,
    recordSuccess,
    retryAfterMs,
} from './login-throttle';

describe('login throttle', () => {
    it('locks an address after MAX_FAILURES within the window', () => {
        const now = 1_000_000;
        for (let i = 0; i < MAX_FAILURES - 1; i++) recordFailure('a', now + i);
        expect(retryAfterMs('a', now + 10)).toBe(0);
        recordFailure('a', now + 10);
        expect(retryAfterMs('a', now + 20)).toBe(WINDOW_MS - 20);
        expect(retryAfterMs('a', now + WINDOW_MS)).toBe(0);
    });

    it('forgets an address on success and keeps addresses apart', () => {
        const now = 2_000_000;
        for (let i = 0; i < MAX_FAILURES; i++) recordFailure('b', now);
        expect(retryAfterMs('b', now)).toBeGreaterThan(0);
        expect(retryAfterMs('c', now)).toBe(0);
        recordSuccess('b');
        expect(retryAfterMs('b', now)).toBe(0);
    });

    it('reads the first forwarded address', () => {
        const request = new Request('http://x', {
            headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
        });
        expect(clientAddress(request)).toBe('203.0.113.9');
        expect(clientAddress(new Request('http://x'))).toBe('unknown');
    });
});
