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

        const job = {
            id: jobId,
            siteId,
            domain: site.domain,
            status: 'pending',
            backupId: null,
            result: null,
            logLines: [],
        };
        jobs.set(jobId, job);

        const run = async () => {
            job.status = 'running';

            const backupRecord = createBackup({
                site_id: siteId,
                started_at: new Date().toISOString(),
                status: 'running',
            });
            job.backupId = Number(backupRecord.lastInsertRowid);

            try {
                const config = buildBackupConfig(basePath);
                const result = await backupSite(site.domain, config, {
                    basePath,
                    ...options,
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
                updateBackup(job.backupId, {
                    finished_at: new Date().toISOString(),
                    status: 'error',
                    error_message: error.message,
                });
                job.status = 'error';
                job.result = { error: error.message };
            }

            this.emit('done', { jobId, backupId: job.backupId, status: job.status });
            this.running--;
            this._processNext();
        };

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

    getRunningJobs() {
        return [...jobs.values()].filter(j => j.status === 'running');
    }

    getPendingJobs() {
        return [...jobs.values()].filter(j => j.status === 'pending');
    }
}

// Singleton
export const backupQueue = new BackupQueue(3);
