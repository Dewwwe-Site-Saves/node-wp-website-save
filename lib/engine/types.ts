/**
 * Contracts between the database layer and the backup engine. The engine only ever sees
 * these decrypted, validated objects, never Prisma models.
 */

export type Protocol = 'ftp' | 'sftp';

export interface SiteConfig {
    domain: string;
    repo: string;
    repoUrl: string;
    protocol: Protocol;
    host: string;
    port: number;
    username: string;
    password: string;
    webRootPath: string;
    spListItemId: string | null;
}

export interface GithubConfig {
    email: string;
    token: string;
}

export interface SharePointConfig {
    tenantId: string;
    clientId: string;
    certThumbprint: string;
    tenantName: string;
    siteName: string;
    listName: string;
    dateField: string;
    /** Absolute path to key.pem */
    certPath: string;
}
