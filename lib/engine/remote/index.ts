import path from 'node:path';
import type { SiteConfig } from '../types';
import type { RemoteClientFactory } from './client';
import { createFtpFactory } from './ftp';
import { createSftpFactory } from './sftp';

export type { RemoteClient, RemoteClientFactory, RemoteEntry } from './client';

export function createRemoteFactory(site: SiteConfig): RemoteClientFactory {
    return site.protocol === 'sftp' ? createSftpFactory(site) : createFtpFactory(site);
}

/** Absolute remote path of the site's web root (`/www`, or `/` when webRootPath is empty). */
export function remoteRootDir(site: SiteConfig): string {
    return path.posix.join('/', site.webRootPath);
}

/** Absolute remote path of a file placed at the web root (dump script, token, dump). */
export function remoteRootFile(site: SiteConfig, name: string): string {
    return path.posix.join(remoteRootDir(site), name);
}
