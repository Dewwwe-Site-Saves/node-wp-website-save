import { EventEmitter } from 'node:events';
import path from 'node:path';
import { getGithubConfig, getSettings, getSharePointConfig, getSiteConfig } from '../db';
import { runBackup } from '../engine/backup';
import { errorMessage } from '../engine/cancel';
import type { LogEntry, TriggerType } from '../engine/types';
import { filesDir } from '../paths';
import { prisma } from '../prisma';
import { ACTIVE_STATUSES, type BackupStatus } from '../validation';

/**
 * DB-first job queue. The `Backup` row is the job: it is created as `pending` at enqueue time,
 * claimed as `running` by the worker loop and updated with the engine result at the end. The
 * only in-memory state is what cannot live in the database — the AbortController and the log
 * buffer of the runs in progress — so a restart leaves nothing behind except rows to sweep.
 */

export interface EnqueueOptions {
    fullDownload?: boolean;
    skipGit?: boolean;
    triggerType?: TriggerType;
}

export interface LogEvent {
    backupId: number;
    entry: LogEntry;
}

export interface DoneEvent {
    backupId: number;
    status: BackupStatus;
}

/** Thrown by `enqueue` when the site already has a pending or running backup. */
export class BackupConflictError extends Error {
    constructor(siteId: number) {
        super(`A backup is already pending or running for site ${siteId}`);
        this.name = 'BackupConflictError';
    }
}

interface RunningJob {
    abort: AbortController;
    logLines: LogEntry[];
}

interface QueueState {
    running: Map<number, RunningJob>;
    events: EventEmitter<{ log: [LogEvent]; done: [DoneEvent] }>;
    dispatching: boolean;
    dispatchAgain: boolean;
    /** Settles when the enqueue in progress is done; the next one chains on it. */
    enqueueLock: Promise<void>;
}

// Cached on globalThis so `next dev` hot reloads keep the running jobs and the listeners.
const globalForQueue = globalThis as unknown as { backupQueue?: QueueState };

const state: QueueState = globalForQueue.backupQueue ?? {
    running: new Map(),
    events: new EventEmitter(),
    dispatching: false,
    dispatchAgain: false,
    enqueueLock: Promise.resolve(),
};
state.events.setMaxListeners(50);

if (process.env.NODE_ENV !== 'production') {
    globalForQueue.backupQueue = state;
}

/** `log` while a run is in progress, `done` once its final status is stored. */
export const events = state.events;

/**
 * Creates the `pending` Backup row and returns its id. Rejects with `BackupConflictError` when
 * the site already has an active backup. The check and the insert run under an in-process
 * lock rather than a database transaction: the app is a single process, so the lock is enough
 * to keep two enqueues from interleaving, and it keeps the queue off Prisma interactive
 * transactions on the single-connection better-sqlite3 adapter.
 */
export async function enqueue(siteId: number, options: EnqueueOptions = {}): Promise<number> {
    const previous = state.enqueueLock;
    let release!: () => void;
    state.enqueueLock = new Promise((resolve) => (release = resolve));
    await previous;

    let backupId: number;
    try {
        const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true } });
        if (!site) throw new Error(`Site not found: ${siteId}`);

        const active = await prisma.backup.findFirst({
            where: { siteId, status: { in: [...ACTIVE_STATUSES] } },
            select: { id: true },
        });
        if (active) throw new BackupConflictError(siteId);

        const backup = await prisma.backup.create({
            data: {
                siteId,
                triggerType: options.triggerType ?? 'manual',
                fullDownload: options.fullDownload === true,
                skipGit: options.skipGit === true,
            },
            select: { id: true },
        });
        backupId = backup.id;
    } finally {
        release();
    }
    void dispatch();
    return backupId;
}

/**
 * Pending: marked `cancelled` right away. Running: the engine is asked to stop and stores the
 * final status itself. Returns false when the backup is unknown or already finished.
 */
export async function cancel(backupId: number): Promise<boolean> {
    const pending = await prisma.backup.updateMany({
        where: { id: backupId, status: 'pending' },
        data: { status: 'cancelled', finishedAt: new Date(), errorMessage: 'Cancelled by user' },
    });
    if (pending.count === 1) {
        state.events.emit('done', { backupId, status: 'cancelled' });
        return true;
    }
    const job = state.running.get(backupId);
    if (!job) return false;
    job.abort.abort();
    return true;
}

/** Log lines of a run in progress (for SSE replay); null once the run is over. */
export function getLogLines(backupId: number): readonly LogEntry[] | null {
    return state.running.get(backupId)?.logLines ?? null;
}

/**
 * Worker loop: claims pending rows (oldest first) while there are free slots. One instance at
 * a time; a call made while it runs makes it go through the pending rows once more, so an
 * enqueue or a completion during the loop is never missed.
 */
async function dispatch(): Promise<void> {
    if (state.dispatching) {
        state.dispatchAgain = true;
        return;
    }
    state.dispatching = true;
    try {
        do {
            state.dispatchAgain = false;
            await fillSlots();
        } while (state.dispatchAgain);
    } catch (error) {
        console.error(`[queue] dispatch failed: ${errorMessage(error)}`);
    } finally {
        state.dispatching = false;
    }
}

async function fillSlots(): Promise<void> {
    const { concurrency } = await getSettings();
    while (state.running.size < concurrency) {
        const next = await prisma.backup.findFirst({
            where: { status: 'pending' },
            orderBy: { id: 'asc' },
            select: { id: true },
        });
        if (!next) return;

        // The row may have been cancelled between the read and the claim: skip it then.
        const claimed = await prisma.backup.updateMany({
            where: { id: next.id, status: 'pending' },
            data: { status: 'running', startedAt: new Date() },
        });
        if (claimed.count === 0) continue;

        const job: RunningJob = { abort: new AbortController(), logLines: [] };
        state.running.set(next.id, job);
        void run(next.id, job)
            .catch((error) => console.error(`[queue] backup ${next.id}: ${errorMessage(error)}`))
            .finally(() => {
                state.running.delete(next.id);
                void dispatch();
            });
    }
}

async function run(backupId: number, job: RunningJob): Promise<void> {
    const backup = await prisma.backup.findUniqueOrThrow({ where: { id: backupId } });
    const onLog = (entry: LogEntry) => {
        job.logLines.push(entry);
        state.events.emit('log', { backupId, entry });
    };

    let status: BackupStatus;
    try {
        const [site, github, sharepoint] = await Promise.all([
            getSiteConfig(backup.siteId),
            getGithubConfig(),
            getSharePointConfig(),
        ]);
        if (!site) throw new Error('Site was deleted');
        if (!github) throw new Error('GitHub token and email are not configured (Settings)');

        const result = await runBackup(site, github, sharepoint, {
            localRoot: path.join(filesDir(), site.repo),
            triggerType: backup.triggerType as TriggerType,
            fullDownload: backup.fullDownload,
            skipGit: backup.skipGit,
            signal: job.abort.signal,
            onLog,
        });
        status = result.status;
        // updateMany rather than update: deleting the site cascades to the row while it runs.
        await prisma.backup.updateMany({
            where: { id: backupId },
            data: {
                status,
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
    } catch (error) {
        // Only reached when the configuration could not be loaded: the engine never throws.
        const cancelled = job.abort.signal.aborted;
        status = cancelled ? 'cancelled' : 'error';
        const message = cancelled ? 'Cancelled by user' : errorMessage(error);
        onLog({ time: new Date().toISOString(), level: 'error', msg: message });
        await prisma.backup.updateMany({
            where: { id: backupId },
            data: {
                status,
                finishedAt: new Date(),
                errorMessage: message,
                log: job.logLines.map((l) => `${l.time} [${l.level}] ${l.msg}`).join('\n'),
            },
        });
    }
    // Gone from the running set before listeners hear about it: the SSE route replays the buffer, then follows the events.
    state.running.delete(backupId);
    state.events.emit('done', { backupId, status });
}
