import { EventEmitter } from 'events';
import { backupSite } from './backup.js';
import { getSiteById, createBackup, updateBackup, buildBackupConfig } from './db.js';

let jobIdCounter = 0;
const jobs = new Map();

class BackupQueue extends EventEmitter {
    constructor(concurrency = 3) {
        super();
        this.setMaxListeners(50);
        this.concurrency = concurrency;
        this.running = 0;
        this.pending = [];
    }

    enqueue(siteId, basePath, options = {}) {
        const jobId = ++jobIdCounter;
        const site = getSiteById(siteId);
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

            const activeOptions = {
                fullDownload: !!options.fullDownload,
                skipGit: !!options.skipGit,
            };

            const backupRecord = createBackup({
                site_id: siteId,
                started_at: new Date().toISOString(),
                status: 'running',
                trigger_type: options.triggerType || 'manual',
                options: JSON.stringify(activeOptions),
            });
            job.backupId = Number(backupRecord.lastInsertRowid);
            resolveStarted(job.backupId);

            try {
                if (job._abortController.signal.aborted) throw new Error('Cancelled');

                const config = buildBackupConfig(basePath);
                const result = await backupSite(site.domain, config, {
                    basePath,
                    ...options,
                    signal: job._abortController.signal,
                    onLog: (entry) => {
                        job.logLines.push(entry);
                        this.emit('log', { jobId, backupId: job.backupId, ...entry });
                    },
                });

                updateBackup(job.backupId, {
                    finished_at: result.finishedAt.toISOString(),
                    status: result.status,
                    duration_ms: result.durationMs,
                    files_downloaded: result.filesDownloaded || 0,
                    files_unchanged: result.filesUnchanged || 0,
                    files_deleted: result.filesDeleted || 0,
                    dump_size_bytes: result.dumpSizeBytes || 0,
                    commit_sha: result.commitSha,
                    error_message: result.error,
                    log: result.log,
                });

                job.status = 'complete';
                job.result = result;
            } catch (error) {
                const isCancelled = error.message === 'Backup cancelled' || job.status === 'cancelled';
                const status = isCancelled ? 'cancelled' : 'error';
                updateBackup(job.backupId, {
                    finished_at: new Date().toISOString(),
                    status,
                    error_message: isCancelled ? 'Cancelled by user' : error.message,
                    log: job.logLines.map(l => `${l.time} [${l.level}] ${l.msg}`).join('\n'),
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
