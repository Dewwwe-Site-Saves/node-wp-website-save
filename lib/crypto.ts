import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Secrets at rest (site passwords, GitHub token) are encrypted with AES-256-GCM.
 * Stored format: `enc:v1:<iv>:<tag>:<ciphertext>`, each part base64. The version prefix
 * allows a future key or algorithm rotation to recognise old values.
 */
const PREFIX = 'enc:v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_PATTERN = /^[0-9a-f]{64}$/i;

function getKey(): Buffer {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || !KEY_PATTERN.test(hex)) {
        throw new Error(
            'ENCRYPTION_KEY must be a 64-character hex string (generate it with: openssl rand -hex 32)',
        );
    }
    return Buffer.from(hex, 'hex');
}

/** Throws with a clear message when the key is missing or malformed. Called at boot. */
export function assertEncryptionKey(): void {
    getKey();
}

export function isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX);
}

export function encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, getKey(), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + [iv, tag, data].map((part) => part.toString('base64')).join(':');
}

export function decrypt(payload: string): string {
    if (!isEncrypted(payload)) {
        throw new Error('Value is not an encrypted payload');
    }
    const parts = payload.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
        throw new Error('Malformed encrypted payload');
    }
    const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
