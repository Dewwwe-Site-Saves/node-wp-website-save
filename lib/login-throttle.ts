/**
 * Per-address brake on `POST /api/auth/login`: every attempt costs a bcrypt comparison, so an unauthenticated caller must not get unlimited tries. In memory on purpose (single process, state lost on restart is fine).
 */

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;

interface Entry {
    failures: number;
    /** End of the window opened by the first failure. */
    resetAt: number;
}

const globalForThrottle = globalThis as unknown as { loginThrottle?: Map<string, Entry> };
const attempts: Map<string, Entry> = (globalForThrottle.loginThrottle ??= new Map());

/** Milliseconds to wait before another attempt from this address, 0 when allowed. */
export function retryAfterMs(address: string, now = Date.now()): number {
    const entry = attempts.get(address);
    if (!entry) return 0;
    if (entry.resetAt <= now) {
        attempts.delete(address);
        return 0;
    }
    return entry.failures >= MAX_FAILURES ? entry.resetAt - now : 0;
}

export function recordFailure(address: string, now = Date.now()): void {
    const entry = attempts.get(address);
    if (!entry || entry.resetAt <= now) {
        attempts.set(address, { failures: 1, resetAt: now + WINDOW_MS });
        return;
    }
    entry.failures += 1;
    // Bounded: a flood of addresses cannot grow the map forever.
    if (attempts.size > 10_000) {
        for (const [key, value] of attempts) {
            if (value.resetAt <= now) attempts.delete(key);
        }
    }
}

export function recordSuccess(address: string): void {
    attempts.delete(address);
}

/** First hop of `X-Forwarded-For` behind the reverse proxy, else the socket is unknown to a route handler. */
export function clientAddress(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}
