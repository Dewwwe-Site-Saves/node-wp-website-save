import { EventEmitter } from 'node:events';
import path from 'node:path';
import { getGithubConfig, getSharePointConfig, getSite, getSiteConfig } from './db';
import { runBackup } from './engine/backup';
import type { LogEntry, TriggerType } from './engine/types';
import { filesDir } from './paths';
import { prisma } from './prisma';

/**
 * In-process queue driving the engine. Kept close to the v1 shape (job ids, in-memory
 * state) so the current API routes keep working; Phase 3 makes it DB-first.
 */

export type JobStatus = 'pending' | 'running' | 'complete' | 'error' | 'cancelled';

export interface Job {
    id: number;
    siteId: number;
    domain: string;
    status: JobStatus;
    backupId: number | null;
    logLines: LogEntry[];
    /** Resolves with the Backup row id once the job starts. */
    started: Promise<number>;
}

interface InternalJob extends Job {
    abort: AbortController | null;
    run: () => Promise<void>;
}

export interface EnqueueOptions {
    fullDownload?: boolean;
    skipGit?: boolean;
    triggerType?: TriggerType;
}

export interface LogEvent extends LogEntry {
    jobId: number;
    backupId: number | null;
}

export interface DoneEvent {
    jobId: number;
    backupId: number | null;
    status: JobStatus;
}

let jobIdCounter = 0;
const jobs = new Map<number, InternalJob>();

class BackupQueue extends EventEmitter {
    private running = 0;
    private pending: InternalJob[] = [];

    constructor(private readonly concurrency: number) {
        super();
        this.setMaxListeners(50);
    }

    async enqueue(siteId: number, options: EnqueueOptions = {}): Promise<Job> {
        const site = await getSite(siteId);
        if (!site) throw new Error(`Site not found: ${siteId}`);

        const jobId = ++jobIdCounter;
        let resolveStarted!: (backupId: number) => void;
        const job: InternalJob = {
            id: jobId,
            siteId,
            domain: site.domain,
            status: 'pending',
            backupId: null,
            logLines: [],
            started: new Promise<number>(resolve => { resolveStarted = resolve; }),
            abort: null,
            run: async () => {
                job.status = 'running';
                job.abort = new AbortController();
                const fullDownload = options.fullDownload === true;
                const skipGit = options.skipGit === true;

                const backup = await prisma.backup.create({
                    data: { siteId, status: 'running', triggerType: options.triggerType ?? 'manual', fullDownload, skipGit, startedAt: new Date() },
                });
                job.backupId = backup.id;
                resolveStarted(backup.id);

                try {
                    if (job.abort.signal.aborted) throw new Error('Backup cancelled');

                    const [siteConfig, github, sharepoint] = await Promise.all([getSiteConfig(siteId), getGithubConfig(), getSharePointConfig()]);
                    if (!siteConfig) throw new Error('Site was deleted');
                    if (!github) throw new Error('GitHub token and email are not configured (Settings)');

                    const result = await runBackup(siteConfig, github, sharepoint, {
                        localRoot: path.join(filesDir(), siteConfig.repo),
                        triggerType: options.triggerType ?? 'manual',
                        fullDownload,
                        skipGit,
                        signal: job.abort.signal,
                        onLog: entry => {
                            job.logLines.push(entry);
                            this.emit('log', { jobId, backupId: job.backupId, ...entry } satisfies LogEvent);
                        },
                    });

                    await prisma.backup.update({
                        where: { id: backup.id },
                        data: {
                            status: result.status,
                            finishedAt: result.finishedAt,
                            durationMs: result.durationMs,
                            filesDownloaded: result.filesDownloaded,
                            filesUnchanged: result.filesUnchanged,
                            filesDeleted: result.filesDeleted,
                            dumpSizeBytes: result.dumpSizeBytes,
                            commitSha: result.commitSha,
                            tag: result.tag,
                            releaseUrl: result.releaseUrl,
                            errorMessage: result.errorMessage,
                            log: result.log,
                        },
                    });
                    job.status = result.status === 'success' ? 'complete' : result.status;
                } catch (error) {
                    const cancelled = job.abort.signal.aborted;
                    const message = error instanceof Error ? error.message : String(error);
                    job.status = cancelled ? 'cancelled' : 'error';
                    await prisma.backup.update({
                        where: { id: backup.id },
                        data: {
                            status: job.status,
                            finishedAt: new Date(),
                            errorMessage: cancelled ? 'Cancelled by user' : message,
                            log: job.logLines.map(l => `${l.time} [${l.level}] ${l.msg}`).join('\n'),
                        },
                    });
                }

                this.emit('done', { jobId, backupId: job.backupId, status: job.status } satisfies DoneEvent);
                this.running--;
                this.processNext();
            },
        };
        jobs.set(jobId, job);
        this.pending.push(job);
        this.processNext();
        return job;
    }

    private processNext(): void {
        while (this.running < this.concurrency && this.pending.length > 0) {
            const job = this.pending.shift()!;
            this.running++;
            void job.run();
        }
    }

    getJob(jobId: number): Job | null {
        return jobs.get(jobId) ?? null;
    }

    /** Pending jobs are dropped; running jobs get their signal aborted and finish on their own. */
    cancelJob(jobId: number): boolean {
        const job = jobs.get(jobId);
        if (!job) return false;
        if (job.status === 'pending') {
            job.status = 'cancelled';
            this.pending = this.pending.filter(j => j !== job);
            return true;
        }
        if (job.status === 'running' && job.abort) {
            job.abort.abort();
            return true;
        }
        return false;
    }

    getRunningJobs(): Job[] {
        return [...jobs.values()].filter(j => j.status === 'running');
    }

    getPendingJobs(): Job[] {
        return [...jobs.values()].filter(j => j.status === 'pending');
    }
}

export const backupQueue = new BackupQueue(2);
