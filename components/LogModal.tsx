'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDuration, formatSize, optionLabels } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface LogEntry {
    time: string;
    level: string;
    msg: string;
}

/** Fields shown in the run info header, all optional until the backup finishes. */
interface RunStats {
    durationMs?: number | null;
    filesDownloaded?: number | null;
    filesUnchanged?: number | null;
    dumpSizeBytes?: number | null;
    commitSha?: string | null;
}

// --- Run mode: show options, start backup, stream logs ---
interface RunModeProps {
    mode: 'run';
    siteId: number;
    domain: string;
    onClose: () => void;
}

// --- Live mode: stream logs for a running job ---
interface LiveModeProps {
    mode: 'live';
    jobId: number;
    domain: string;
    siteId?: number;
    onClose: () => void;
}

// --- History mode: show stored log from DB ---
interface HistoryModeProps extends RunStats {
    mode: 'history';
    backupId: number;
    domain: string;
    siteId?: number;
    status?: string;
    startedAt?: string;
    fullDownload?: boolean;
    skipGit?: boolean;
    onClose: () => void;
}

type LogModalProps = RunModeProps | LiveModeProps | HistoryModeProps;

export function LogModal(props: LogModalProps) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
            onClick={props.onClose}
        >
            <div className="absolute inset-0 bg-black/50" />
            <div
                className="relative w-full max-w-3xl max-h-[90vh] sm:max-h-[80vh] flex flex-col rounded-lg border bg-card shadow-lg overflow-hidden text-left"
                onClick={(e) => e.stopPropagation()}
            >
                {props.mode === 'run' && <RunContent {...props} />}
                {props.mode === 'live' && <LiveContent {...props} />}
                {props.mode === 'history' && <HistoryContent {...props} />}
            </div>
        </div>
    );
}

// ============ Run Mode ============

function RunContent({ siteId, domain, onClose }: RunModeProps) {
    const [fullDownload, setFullDownload] = useState(false);
    const [skipGit, setSkipGit] = useState(false);
    const [jobId, setJobId] = useState<number | null>(null);
    const [backupId, setBackupId] = useState<number | null>(null);
    const [starting, setStarting] = useState(false);
    const [startedAt, setStartedAt] = useState<string | null>(null);
    const [runStatus, setRunStatus] = useState<string | null>(null);
    const [stats, setStats] = useState<RunStats>({});
    const [logOpen, setLogOpen] = useState(true);

    async function handleStart() {
        setStarting(true);
        try {
            const res = await fetch(`/api/backups/run/${siteId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullDownload, skipGit }),
            });
            const data = await res.json();
            if (data.jobId) {
                setJobId(data.jobId);
                setBackupId(data.backupId);
                setStartedAt(new Date().toISOString());
                setRunStatus('running');
            } else {
                setStarting(false);
            }
        } catch {
            setStarting(false);
        }
    }

    async function handleCancel() {
        if (!jobId) return;
        await fetch(`/api/backups/cancel/${jobId}`, { method: 'POST' });
        setRunStatus('cancelled');
    }

    // Fetch final result info when backup completes
    function handleStatusChange(status: string) {
        setRunStatus(status);
        if ((status === 'success' || status === 'error' || status === 'cancelled') && backupId) {
            fetch(`/api/backups/${backupId}/log`)
                .then((r) => r.json())
                .then((data) =>
                    setStats({
                        durationMs: data.durationMs,
                        filesDownloaded: data.filesDownloaded,
                        filesUnchanged: data.filesUnchanged,
                        dumpSizeBytes: data.dumpSizeBytes,
                        commitSha: data.commitSha,
                    }),
                )
                .catch(() => {});
        }
    }

    return (
        <>
            <ModalHeader
                domain={domain}
                siteId={siteId}
                status={runStatus}
                onClose={onClose}
                onCancel={jobId ? handleCancel : undefined}
            />
            <div className="flex-1 overflow-y-auto">
                {!jobId ? (
                    <div className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Full download</Label>
                                <p className="text-xs text-muted-foreground">
                                    Re-download all files instead of incremental
                                </p>
                            </div>
                            <Switch checked={fullDownload} onCheckedChange={setFullDownload} />
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Skip git commit</Label>
                                <p className="text-xs text-muted-foreground">
                                    Download files without committing to GitHub
                                </p>
                            </div>
                            <Switch checked={skipGit} onCheckedChange={setSkipGit} />
                        </div>
                        <Button onClick={handleStart} disabled={starting} className="w-full">
                            {starting ? 'Starting...' : 'Start Backup'}
                        </Button>
                    </div>
                ) : (
                    <>
                        <RunInfo
                            startedAt={startedAt}
                            status={runStatus}
                            trigger="manual"
                            fullDownload={fullDownload}
                            skipGit={skipGit}
                            {...stats}
                        />
                        <CollapsibleLog open={logOpen} onToggle={() => setLogOpen(!logOpen)}>
                            <LogStream jobId={jobId} onStatusChange={handleStatusChange} />
                        </CollapsibleLog>
                    </>
                )}
            </div>
        </>
    );
}

// ============ Live Mode ============

function LiveContent({ jobId, domain, siteId, onClose }: LiveModeProps) {
    const [runStatus, setRunStatus] = useState<string>('running');
    const [logOpen, setLogOpen] = useState(true);

    async function handleCancel() {
        await fetch(`/api/backups/cancel/${jobId}`, { method: 'POST' });
        setRunStatus('cancelled');
    }

    return (
        <>
            <ModalHeader
                domain={domain}
                siteId={siteId}
                status={runStatus}
                onClose={onClose}
                onCancel={handleCancel}
            />
            <div className="flex-1 overflow-y-auto">
                <RunInfo status={runStatus} trigger="manual" />
                <CollapsibleLog open={logOpen} onToggle={() => setLogOpen(!logOpen)}>
                    <LogStream jobId={jobId} onStatusChange={setRunStatus} />
                </CollapsibleLog>
            </div>
        </>
    );
}

// ============ History Mode ============

function HistoryContent({
    backupId,
    domain,
    siteId,
    status: initialStatus,
    startedAt,
    fullDownload,
    skipGit,
    onClose,
    ...initialStats
}: HistoryModeProps) {
    const [logLines, setLogLines] = useState<LogEntry[] | null>(null);
    const [status, setStatus] = useState<string>(initialStatus || 'loading');
    const [logOpen, setLogOpen] = useState(false);
    const [info, setInfo] = useState<
        RunStats & { startedAt?: string | null; fullDownload?: boolean; skipGit?: boolean }
    >({
        ...initialStats,
        startedAt,
        fullDownload,
        skipGit,
    });

    useEffect(() => {
        fetch(`/api/backups/${backupId}/log`)
            .then((res) => res.json())
            .then((data) => {
                setLogLines(parseStoredLog(data.log || ''));
                setStatus(data.status);
                setInfo((prev) => ({
                    ...prev,
                    startedAt: data.startedAt ?? prev.startedAt,
                    durationMs: data.durationMs ?? prev.durationMs,
                    filesDownloaded: data.filesDownloaded ?? prev.filesDownloaded,
                    filesUnchanged: data.filesUnchanged ?? prev.filesUnchanged,
                    dumpSizeBytes: data.dumpSizeBytes ?? prev.dumpSizeBytes,
                    commitSha: data.commitSha ?? prev.commitSha,
                    fullDownload: data.fullDownload ?? prev.fullDownload,
                    skipGit: data.skipGit ?? prev.skipGit,
                }));
            })
            .catch(() => {
                setLogLines([{ time: '', level: 'error', msg: 'Failed to load log' }]);
                setStatus('error');
            });
    }, [backupId]);

    return (
        <>
            <ModalHeader domain={domain} siteId={siteId} status={status} onClose={onClose} />
            <div className="flex-1 overflow-y-auto">
                <RunInfo status={status} {...info} />
                <CollapsibleLog open={logOpen} onToggle={() => setLogOpen(!logOpen)}>
                    <div className="p-4 font-mono text-xs bg-slate-950 text-slate-300 h-[300px] overflow-y-auto">
                        {logLines === null ? (
                            <span className="text-slate-500">Loading...</span>
                        ) : (
                            logLines.map((line, i) => (
                                <div
                                    key={i}
                                    className={`py-0.5 ${
                                        line.level === 'error'
                                            ? 'text-red-400'
                                            : line.level === 'warn'
                                              ? 'text-yellow-400'
                                              : 'text-slate-300'
                                    }`}
                                >
                                    {line.time && (
                                        <span className="text-slate-600 mr-2">
                                            {new Date(line.time).toLocaleTimeString()}
                                        </span>
                                    )}
                                    {line.msg}
                                </div>
                            ))
                        )}
                    </div>
                </CollapsibleLog>
            </div>
        </>
    );
}

/** Parse stored log text (format: "timestamp [level] message" per line) into LogEntry[] */
function parseStoredLog(log: string): LogEntry[] {
    if (!log.trim()) return [{ time: '', level: 'info', msg: 'No log available' }];

    return log
        .split('\n')
        .filter((l) => l.trim())
        .map((line) => {
            // Format: "2026-09-01T19:32:00.000Z [info] [domain] message"
            const match = line.match(/^(\S+)\s+\[(\w+)]\s+(.+)$/);
            if (match) {
                return { time: match[1], level: match[2], msg: match[3] };
            }
            return { time: '', level: 'info', msg: line };
        });
}

// ============ Shared Components ============

function ModalHeader({
    domain,
    siteId,
    status,
    onClose,
    onCancel,
}: {
    domain: string;
    siteId?: number;
    status: string | null;
    onClose: () => void;
    onCancel?: () => void;
}) {
    const badge =
        !status || status === 'loading' ? null : status === 'running' ? (
            <Badge variant="outline" className="animate-pulse border-primary text-primary">
                RUNNING
            </Badge>
        ) : status === 'success' || status === 'complete' ? (
            <Badge variant="default">SUCCESS</Badge>
        ) : status === 'cancelled' ? (
            <Badge variant="secondary">CANCELLED</Badge>
        ) : status === 'error' ? (
            <Badge variant="destructive">FAILED</Badge>
        ) : (
            <Badge variant="secondary">{status.toUpperCase()}</Badge>
        );

    return (
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
                {siteId ? (
                    <a
                        href={`/sites/${siteId}`}
                        className="font-medium text-primary hover:underline"
                    >
                        {domain}
                    </a>
                ) : (
                    <span className="font-medium">{domain}</span>
                )}
                {badge}
            </div>
            <div className="flex items-center gap-2">
                {onCancel && status === 'running' && (
                    <Button variant="destructive" size="sm" onClick={onCancel}>
                        Cancel run
                    </Button>
                )}
                <Button variant="ghost" size="sm" onClick={onClose}>
                    Close
                </Button>
            </div>
        </div>
    );
}

function RunInfo({
    startedAt,
    status,
    trigger,
    durationMs,
    filesDownloaded,
    filesUnchanged,
    dumpSizeBytes,
    commitSha,
    fullDownload,
    skipGit,
}: RunStats & {
    startedAt?: string | null;
    status?: string | null;
    trigger?: string;
    fullDownload?: boolean;
    skipGit?: boolean;
}) {
    const options = optionLabels(!!fullDownload, !!skipGit, true);

    return (
        <div className="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm border-b border-border">
            {startedAt && (
                <div>
                    <span className="text-muted-foreground text-xs">Started</span>
                    <p className="font-medium text-xs">{new Date(startedAt).toLocaleString()}</p>
                </div>
            )}
            {trigger && (
                <div>
                    <span className="text-muted-foreground text-xs">Trigger</span>
                    <p className="font-medium text-xs capitalize">{trigger}</p>
                </div>
            )}
            {durationMs != null && (
                <div>
                    <span className="text-muted-foreground text-xs">Duration</span>
                    <p className="font-medium text-xs">{formatDuration(durationMs)}</p>
                </div>
            )}
            {filesDownloaded != null && (
                <div>
                    <span className="text-muted-foreground text-xs">Files (updated / total)</span>
                    <p className="font-medium text-xs">
                        {filesDownloaded} / {filesDownloaded + (filesUnchanged ?? 0)}
                    </p>
                </div>
            )}
            {options.length > 0 && (
                <div>
                    <span className="text-muted-foreground text-xs">Options</span>
                    <p className="font-medium text-xs">{options.join(', ')}</p>
                </div>
            )}
            {dumpSizeBytes != null && (
                <div>
                    <span className="text-muted-foreground text-xs">DB dump</span>
                    <p className="font-medium text-xs">{formatSize(dumpSizeBytes)}</p>
                </div>
            )}
            {commitSha && (
                <div>
                    <span className="text-muted-foreground text-xs">Commit</span>
                    <p className="font-medium text-xs font-mono">{commitSha}</p>
                </div>
            )}
        </div>
    );
}

function CollapsibleLog({
    open,
    onToggle,
    children,
}: {
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <div className="border-t border-border">
            <button
                onClick={onToggle}
                className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors cursor-pointer"
            >
                <svg
                    className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                {open ? 'Hide log' : 'Show log'}
            </button>
            {open && <div className="h-[300px]">{children}</div>}
        </div>
    );
}

function LogStream({
    jobId,
    onStatusChange,
}: {
    jobId: number;
    onStatusChange?: (status: string) => void;
}) {
    const [lines, setLines] = useState<LogEntry[]>([]);
    const [status, setStatus] = useState('connecting');
    const bottomRef = useRef<HTMLDivElement>(null);
    // Latest callback without re-subscribing the event source on every parent render
    const onStatusChangeRef = useRef(onStatusChange);
    useEffect(() => {
        onStatusChangeRef.current = onStatusChange;
    });

    useEffect(() => {
        setLines([]);
        const source = new EventSource(`/api/backups/logs/${jobId}`);

        source.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'log') {
                setLines((prev) => [
                    ...prev,
                    { time: data.time, level: data.level, msg: data.msg },
                ]);
            } else if (data.type === 'status') {
                setStatus(data.status);
                onStatusChangeRef.current?.(data.status);
            } else if (data.type === 'done') {
                // The queue still says "complete" for a successful run; every other status is already the stored one.
                const finalStatus = data.status === 'complete' ? 'success' : data.status;
                setStatus(finalStatus);
                onStatusChangeRef.current?.(finalStatus);
                source.close();
            }
        };

        source.onerror = () => source.close();
        return () => source.close();
    }, [jobId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [lines]);

    return (
        <div className="p-4 font-mono text-xs bg-slate-950 text-slate-300 text-left h-full overflow-y-auto">
            {lines.length === 0 && status === 'connecting' && (
                <span className="text-slate-500">Connecting...</span>
            )}
            {lines.map((line, i) => (
                <div
                    key={i}
                    className={`py-0.5 ${
                        line.level === 'error'
                            ? 'text-red-400'
                            : line.level === 'warn'
                              ? 'text-yellow-400'
                              : 'text-slate-300'
                    }`}
                >
                    <span className="text-slate-600 mr-2">
                        {new Date(line.time).toLocaleTimeString()}
                    </span>
                    {line.msg}
                </div>
            ))}
            <div ref={bottomRef} />
        </div>
    );
}
