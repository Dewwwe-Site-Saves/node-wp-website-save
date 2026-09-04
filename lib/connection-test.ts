import { errorMessage } from './engine/cancel';
import { testConnection } from './engine/remote';
import type { ConnectionConfig } from './engine/types';

/** What the site form shows after "Test connection": the web root listing, or the reason it failed. */
export interface ConnectionTestResult {
    ok: boolean;
    entries: { name: string; type: 'file' | 'dir'; size: number }[];
    error: string | null;
}

export async function runConnectionTest(config: ConnectionConfig): Promise<ConnectionTestResult> {
    try {
        const entries = await testConnection(config);
        return {
            ok: true,
            entries: entries
                .map((entry) => ({
                    name: entry.path.slice(entry.path.lastIndexOf('/') + 1),
                    type: entry.type,
                    size: entry.size,
                }))
                .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name)),
            error: null,
        };
    } catch (error) {
        return { ok: false, entries: [], error: errorMessage(error) };
    }
}
