'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { LogModal } from '@/components/LogModal';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface Backup {
    id: number;
    site_id: number;
    domain?: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    duration_ms: number | null;
    files_downloaded: number | null;
    files_unchanged: number | null;
    dump_size_bytes: number | null;
    commit_sha: string | null;
    trigger_type?: string;
    options?: string;
}

interface RunningJob {
    id: number;
    siteId: number;
    domain: string;
}

interface ModalState {
    mode: 'live' | 'history';
    jobId?: number;
    backupId?: number;
    domain: string;
    siteId?: number;
    status?: string;
    startedAt?: string;
    durationMs?: number | null;
    filesDownloaded?: number | null;
    dumpSizeBytes?: number | null;
    commitSha?: string | null;
}

export function BackupHistory({ backups, showDomain = true, siteId }: { backups: Backup[]; showDomain?: boolean; siteId?: number }) {
    const [runningJobs, setRunningJobs] = useState<RunningJob[]>([]);
    const [modal, setModal] = useState<ModalState | null>(null);
    const router = useRouter();

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch('/api/backups/status');
                const data = await res.json();
                setRunningJobs([...data.running, ...data.pending]);
            } catch { /* ignore */ }
        };
        fetchStatus();
        const interval = setInterval(() => {
            fetchStatus();
            if (runningJobs.length > 0) router.refresh();
        }, 3000);
        return () => clearInterval(interval);
    }, [runningJobs.length]);

    function handleRowClick(backup: Backup) {
        // Check if this backup is currently running
        const runningJob = runningJobs.find(j => j.siteId === backup.site_id && backup.status === 'running');
        if (runningJob) {
            setModal({ mode: 'live', jobId: runningJob.id, domain: runningJob.domain, siteId: backup.site_id });
        } else {
            setModal({
                mode: 'history',
                backupId: backup.id,
                domain: backup.domain || '',
                siteId: backup.site_id,
                status: backup.status,
                startedAt: backup.started_at,
                durationMs: backup.duration_ms,
                filesDownloaded: backup.files_downloaded,
                dumpSizeBytes: backup.dump_size_bytes,
                commitSha: backup.commit_sha,
            });
        }
    }

    function handleRunningClick(job: RunningJob) {
        setModal({ mode: 'live', jobId: job.id, domain: job.domain, siteId: job.siteId });
    }

    // Filter out running jobs that already have a DB entry to avoid duplicates
    // Filter running jobs to match the page context (all sites or single site)
    const relevantRunning = siteId ? runningJobs.filter(j => j.siteId === siteId) : runningJobs;
    const runningSiteIds = new Set(backups.filter(b => b.status === 'running').map(b => b.site_id));
    const extraRunning = relevantRunning.filter(j => !runningSiteIds.has(j.siteId));

    return (
        <>
            <Table>
                <TableHeader>
                    <TableRow>
                        {showDomain && <TableHead>Site</TableHead>}
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Options</TableHead>
                        <TableHead>Files (updated / total)</TableHead>
                        <TableHead>Dump</TableHead>
                        <TableHead>Commit</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {extraRunning.map(job => (
                        <TableRow key={`running-${job.id}`} className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleRunningClick(job)}>
                            {showDomain && <TableCell className="font-medium">{job.domain}</TableCell>}
                            <TableCell>
                                <Badge variant="outline" className="animate-pulse border-primary text-primary">RUNNING</Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">Now</TableCell>
                            <TableCell className="text-muted-foreground">-</TableCell>
                            <TableCell className="text-muted-foreground">-</TableCell>
                            <TableCell className="text-muted-foreground">-</TableCell>
                            <TableCell className="text-muted-foreground">-</TableCell>
                            <TableCell className="text-muted-foreground">-</TableCell>
                        </TableRow>
                    ))}
                    {backups.map(backup => (
                        <TableRow key={backup.id} className="cursor-pointer hover:bg-muted/50"
                            onClick={() => handleRowClick(backup)}>
                            {showDomain && <TableCell className="font-medium">{backup.domain}</TableCell>}
                            <TableCell>
                                {backup.status === 'running'
                                    ? <Badge variant="outline" className="animate-pulse border-primary text-primary">RUNNING</Badge>
                                    : <StatusBadge status={backup.status} />
                                }
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {new Date(backup.started_at).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {backup.duration_ms ? formatDuration(backup.duration_ms) : '-'}
                            </TableCell>
                            <TableCell>
                                <OptionsCell options={backup.options} />
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {backup.files_downloaded != null
                                    ? `${backup.files_downloaded} / ${(backup.files_downloaded || 0) + (backup.files_unchanged || 0)}`
                                    : '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                                {backup.dump_size_bytes ? formatSize(backup.dump_size_bytes) : '-'}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                                {backup.commit_sha || '-'}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {modal && modal.mode === 'live' && modal.jobId && (
                <LogModal mode="live" jobId={modal.jobId} domain={modal.domain} siteId={modal.siteId}
                    onClose={() => { setModal(null); router.refresh(); }} />
            )}
            {modal && modal.mode === 'history' && modal.backupId && (
                <LogModal mode="history" backupId={modal.backupId} domain={modal.domain} siteId={modal.siteId}
                    status={modal.status} startedAt={modal.startedAt}
                    durationMs={modal.durationMs} filesDownloaded={modal.filesDownloaded}
                    dumpSizeBytes={modal.dumpSizeBytes} commitSha={modal.commitSha}
                    onClose={() => setModal(null)} />
            )}
        </>
    );
}

function OptionsCell({ options }: { options?: string }) {
    if (!options) return <span className="text-muted-foreground">-</span>;
    try {
        const parsed = JSON.parse(options);
        const tags = [];
        if (parsed.fullDownload) tags.push('Full');
        if (parsed.skipGit) tags.push('No git');
        if (tags.length === 0) return <span className="text-muted-foreground">-</span>;
        return (
            <div className="flex gap-1">
                {tags.map(t => (
                    <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                ))}
            </div>
        );
    } catch {
        return <span className="text-muted-foreground">-</span>;
    }
}

function formatDuration(ms: number): string {
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
