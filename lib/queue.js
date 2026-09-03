import { EventEmitter } from 'events';
import { backupSite } from './backup.js';
import { getGithubConfig, getSharePointConfig, getSite, getSiteConfig } from './db';
import { prisma } from './prisma';

let jobIdCounter = 0;
const jobs = new Map();

/**
 * Builds the config object the v1 engine expects from the typed configs.
 * Goes away with the engine rewrite (Phase 2).
 */
function toLegacyConfig(site, github, sharepoint, basePath) {
    return {
        localPath: basePath,
        filesPath: basePath + '/files/',
        github: {
            // Any username works with a GitHub token over HTTPS
            user: 'x-access-token',
            appPass: github?.token ?? '',
            mail: github?.email ?? '',
        },
        sharepoint: sharepoint
            ? {
                tenantID: sharepoint.tenantId,
                applicationClientID: sharepoint.clientId,
                certificateThumbprint: sharepoint.certThumbprint,
                tenantName: sharepoint.tenantName,
                siteName: sharepoint.siteName,
                listName: sharepoint.listName,
                dateFieldName: sharepoint.dateField,
            }
            : undefined,
        sites: {
            [site.domain]: {
                repo: site.repo,
                repoUrl: site.repoUrl,
                ftp: {
                    webRootPath: site.webRootPath,
                    host: site.host,
                    user: site.username,
                    password: site.password,
                    port: site.port,
                    sftp: site.protocol === 'sftp',
                },
                spListItemID: site.spListItemId,
            },
        },
    };
}

class BackupQueue extends EventEmitter {
    constructor(concurrency = 3) {
        super();
        this.setMaxListeners(50);
        this.concurrency = concurrency;
        this.running = 0;
        this.pending = [];
    }

    async enqueue(siteId, basePath, options = {}) {
        const jobId = ++jobIdCounter;
        const site = await getSite(siteId);
        if (!site) throw new Error(`Site not found: ${siteId}`);

        let resolveStarted;
        const startedPromise = new Promise(r => { resolveStarted = r; });

        const job = {
            id: jobId,
            siteId,
            domain: site.domain,
            status: 'pending',
            backupId: null,
            result: null,
            logLines: [],
            started: startedPromise,
        };
        jobs.set(jobId, job);

        const run = async () => {
            job.status = 'running';
            job._abortController = new AbortController();

            const fullDownload = !!options.fullDownload;
            const skipGit = !!options.skipGit;

            const backup = await prisma.backup.create({
                data: {
                    siteId,
                    status: 'running',
                    triggerType: options.triggerType || 'manual',
                    fullDownload,
                    skipGit,
                    startedAt: new Date(),
                },
            });
            job.backupId = backup.id;
            resolveStarted(job.backupId);

            try {
                if (job._abortController.signal.aborted) throw new Error('Cancelled');

                const [siteConfig, github, sharepoint] = await Promise.all([
                    getSiteConfig(siteId),
                    getGithubConfig(),
                    getSharePointConfig(),
                ]);
                const config = toLegacyConfig(siteConfig, github, sharepoint, basePath);
                const result = await backupSite(site.domain, config, {
                    basePath,
                    fullDownload,
                    skipGit,
                    signal: job._abortController.signal,
                    onLog: (entry) => {
                        job.logLines.push(entry);
                        this.emit('log', { jobId, backupId: job.backupId, ...entry });
                    },
                });

                await prisma.backup.update({
                    where: { id: job.backupId },
                    data: {
                        finishedAt: result.finishedAt,
                        status: result.status,
                        durationMs: result.durationMs,
                        filesDownloaded: result.filesDownloaded || 0,
                        filesUnchanged: result.filesUnchanged || 0,
                        filesDeleted: result.filesDeleted || 0,
                        dumpSizeBytes: result.dumpSizeBytes || 0,
                        commitSha: result.commitSha,
                        errorMessage: result.error,
                        log: result.log,
                    },
                });

                job.status = 'complete';
                job.result = result;
            } catch (error) {
                const isCancelled = error.message === 'Backup cancelled' || job.status === 'cancelled';
                const status = isCancelled ? 'cancelled' : 'error';
                await prisma.backup.update({
                    where: { id: job.backupId },
                    data: {
                        finishedAt: new Date(),
                        status,
                        errorMessage: isCancelled ? 'Cancelled by user' : error.message,
                        log: job.logLines.map(l => `${l.time} [${l.level}] ${l.msg}`).join('\n'),
                    },
                });
                job.status = status;
                job.result = { error: error.message };
            }

            this.emit('done', { jobId, backupId: job.backupId, status: job.status });
            this.running--;
            this._processNext();
        };

        job._run = run;
        this.pending.push(run);
        this._processNext();

        return job;
    }

    _processNext() {
        while (this.running < this.concurrency && this.pending.length > 0) {
            this.running++;
            const next = this.pending.shift();
            next();
        }
    }

    getJob(jobId) {
        return jobs.get(jobId) || null;
    }

    cancelJob(jobId) {
        const job = jobs.get(jobId);
        if (!job) return false;

        if (job.status === 'pending') {
            job.status = 'cancelled';
            this.pending = this.pending.filter(fn => fn !== job._run);
            return true;
        }

        if (job.status === 'running' && job._abortController) {
            job._abortController.abort();
            job.status = 'cancelled';
            return true;
        }

        return false;
    }

    getRunningJobs() {
        return [...jobs.values()].filter(j => j.status === 'running');
    }

    getPendingJobs() {
        return [...jobs.values()].filter(j => j.status === 'pending');
    }
}

// Singleton
export const backupQueue = new BackupQueue(3);
