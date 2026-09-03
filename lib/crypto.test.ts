import { beforeEach, describe, expect, it } from 'vitest';
import { assertEncryptionKey, decrypt, encrypt, isEncrypted } from './crypto';

const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

describe('crypto', () => {
    beforeEach(() => {
        process.env.ENCRYPTION_KEY = KEY;
    });

    it('round-trips a value', () => {
        const payload = encrypt('s3cret pa$$word');
        expect(isEncrypted(payload)).toBe(true);
        expect(payload.startsWith('enc:v1:')).toBe(true);
        expect(decrypt(payload)).toBe('s3cret pa$$word');
    });

    it('produces a different payload every time', () => {
        expect(encrypt('same')).not.toBe(encrypt('same'));
    });

    it('rejects a payload encrypted with another key', () => {
        const payload = encrypt('value');
        process.env.ENCRYPTION_KEY = OTHER_KEY;
        expect(() => decrypt(payload)).toThrow();
    });

    it('rejects tampered data', () => {
        const payload = encrypt('value');
        const tampered = payload.slice(0, -4) + (payload.endsWith('AAAA') ? 'BBBB' : 'AAAA');
        expect(() => decrypt(tampered)).toThrow();
    });

    it('rejects values that are not encrypted payloads', () => {
        expect(() => decrypt('plain text')).toThrow('not an encrypted payload');
        expect(() => decrypt('enc:v1:only:two')).toThrow('Malformed');
        expect(isEncrypted('plain text')).toBe(false);
    });

    it('requires a 64-character hex key', () => {
        process.env.ENCRYPTION_KEY = 'too-short';
        expect(() => assertEncryptionKey()).toThrow('ENCRYPTION_KEY');
        delete process.env.ENCRYPTION_KEY;
        expect(() => encrypt('x')).toThrow('ENCRYPTION_KEY');
    });
});
