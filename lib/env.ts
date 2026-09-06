/**
 * Public URL of the instance (`APP_URL`, e.g. `https://backups.example.com`), the one users open in their browser. Null when unset: links are then left out of the notifications. Read when called, like the path helpers, so scripts that load `.env` late still see it.
 */
export function appUrl(): string | null {
    const value = process.env.APP_URL?.trim().replace(/\/+$/, '');
    return value || null;
}
