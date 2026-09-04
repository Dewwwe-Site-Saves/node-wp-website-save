import SftpClient from 'ssh2-sftp-client';
import type { SiteConfig } from '../types';
import type { RemoteClient, RemoteClientFactory, RemoteEntry } from './client';

const READY_TIMEOUT_MS = 30_000;
const KEEPALIVE_INTERVAL_MS = 10_000;
/**
 * Separate SSH sessions rather than parallel requests on one: ssh2-sftp-client documents
 * that a single client is not safe for concurrent operations. Three sessions stay under
 * the connection limits of shared hosts.
 */
const POOL_SIZE = 3;

export function createSftpFactory(site: SiteConfig): RemoteClientFactory {
    return {
        poolSize: POOL_SIZE,
        async create() {
            const client = new SftpClient();
            try {
                await client.connect({
                    host: site.host,
                    port: site.port,
                    username: site.username,
                    password: site.password,
                    readyTimeout: READY_TIMEOUT_MS,
                    keepaliveInterval: KEEPALIVE_INTERVAL_MS,
                    keepaliveCountMax: 3,
                });
            } catch (error) {
                throw new Error(
                    `SFTP connection to ${site.host}:${site.port} failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
            return new SftpRemoteClient(client);
        },
    };
}

class SftpRemoteClient implements RemoteClient {
    constructor(private readonly client: SftpClient) {}

    async list(dir: string): Promise<RemoteEntry[]> {
        const items = await this.client.list(dir);
        const entries: RemoteEntry[] = [];
        for (const item of items) {
            // 'l' (symlink) is downloaded like a file: fastGet follows the link.
            if (item.type !== 'd' && item.type !== '-' && item.type !== 'l') continue;
            entries.push({
                path: dir === '/' ? `/${item.name}` : `${dir}/${item.name}`,
                type: item.type === 'd' ? 'dir' : 'file',
                size: item.size,
                // modifyTime is already in milliseconds.
                mtime: item.modifyTime ? new Date(item.modifyTime) : null,
            });
        }
        return entries;
    }

    async download(remotePath: string, localPath: string): Promise<void> {
        await this.client.fastGet(remotePath, localPath);
    }

    async upload(content: Buffer, remotePath: string): Promise<void> {
        await this.client.put(content, remotePath);
    }

    async remove(remotePath: string): Promise<void> {
        await this.client.delete(remotePath);
    }

    async close(): Promise<void> {
        await this.client.end();
    }
}
