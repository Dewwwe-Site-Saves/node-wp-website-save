'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BackupWithDomain } from '@/lib/db';
import { formatDuration, formatSize, optionLabels } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { LogModal } from '@/components/LogModal';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

interface RunningJob {
    id: number;
    siteId: number;
    domain: string;
}

type ModalState =
    | { mode: 'live'; jobId: number; domain: string; siteId: number }
    | { mode: 'history'; backup: BackupWithDomain };

export function BackupHistory({
    backups,
    showDomain = true,
    siteId,
}: {
    backups: BackupWithDomain[];
    showDomain?: boolean;
    siteId?: number;
}) {
    const [runningJobs, setRunningJobs] = useState<RunningJob[]>([]);
    const [modal, setModal] = useState<ModalState | null>(null);
    const router = useRouter();

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch('/api/backups/status');
                const data = await res.json();
                setRunningJobs([...data.running, ...data.pending]);
            } catch {
                /* ignore */
            }
        };
        fetchStatus();
        const interval = setInterval(() => {
            fetchStatus();
            if (runningJobs.length > 0) router.refresh();
        }, 3000);
        return () => clearInterval(interval);
    }, [runningJobs.length, router]);

    function handleRowClick(backup: BackupWithDomain) {
        const runningJob =
            backup.status === 'running'
                ? runningJobs.find((j) => j.siteId === backup.siteId)
                : undefined;
        if (runningJob) {
            setModal({
                mode: 'live',
                jobId: runningJob.id,
                domain: runningJob.domain,
                siteId: backup.siteId,
            });
        } else {
            setModal({ mode: 'history', backup });
        }
    }

    // Jobs known to the queue but not yet visible as a DB row on this page
    const relevantRunning = siteId ? runningJobs.filter((j) => j.siteId === siteId) : runningJobs;
    const runningSiteIds = new Set(
        backups.filter((b) => b.status === 'running').map((b) => b.siteId),
    );
    const extraRunning = relevantRunning.filter((j) => !runningSiteIds.has(j.siteId));

    return (
        <>
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            {showDomain && <TableHead>Site</TableHead>}
                            <TableHead>Status</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="hidden sm:table-cell">Duration</TableHead>
                            <TableHead className="hidden lg:table-cell">Options</TableHead>
                            <TableHead className="hidden sm:table-cell">Files</TableHead>
                            <TableHead className="hidden lg:table-cell">Dump</TableHead>
                            <TableHead>Commit</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {extraRunning.map((job) => (
                            <TableRow
                                key={`running-${job.id}`}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() =>
                                    setModal({
                                        mode: 'live',
                                        jobId: job.id,
                                        domain: job.domain,
                                        siteId: job.siteId,
                                    })
                                }
                            >
                                {showDomain && (
                                    <TableCell className="font-medium">{job.domain}</TableCell>
                                )}
                                <TableCell>
                                    <Badge
                                        variant="outline"
                                        className="animate-pulse border-primary text-primary"
                                    >
                                        RUNNING
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground">Now</TableCell>
                                <TableCell className="hidden sm:table-cell text-muted-foreground">
                                    -
                                </TableCell>
                                <TableCell className="hidden lg:table-cell text-muted-foreground">
                                    -
                                </TableCell>
                                <TableCell className="hidden sm:table-cell text-muted-foreground">
                                    -
                                </TableCell>
                                <TableCell className="hidden lg:table-cell text-muted-foreground">
                                    -
                                </TableCell>
                                <TableCell className="text-muted-foreground">-</TableCell>
                            </TableRow>
                        ))}
                        {backups.map((backup) => (
                            <TableRow
                                key={backup.id}
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => handleRowClick(backup)}
                            >
                                {showDomain && (
                                    <TableCell className="font-medium">
                                        {backup.site.domain}
                                    </TableCell>
                                )}
                                <TableCell>
                                    {backup.status === 'running' ? (
                                        <Badge
                                            variant="outline"
                                            className="animate-pulse border-primary text-primary"
                                        >
                                            RUNNING
                                        </Badge>
                                    ) : (
                                        <StatusBadge status={backup.status} />
                                    )}
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                    {new Date(backup.startedAt ?? backup.queuedAt).toLocaleString()}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell text-muted-foreground">
                                    {backup.durationMs ? formatDuration(backup.durationMs) : '-'}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell">
                                    <OptionsCell
                                        fullDownload={backup.fullDownload}
                                        skipGit={backup.skipGit}
                                    />
                                </TableCell>
                                <TableCell className="hidden sm:table-cell text-muted-foreground">
                                    {backup.filesDownloaded != null
                                        ? `${backup.filesDownloaded} / ${backup.filesDownloaded + (backup.filesUnchanged ?? 0)}`
                                        : '-'}
                                </TableCell>
                                <TableCell className="hidden lg:table-cell text-muted-foreground">
                                    {backup.dumpSizeBytes ? formatSize(backup.dumpSizeBytes) : '-'}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                    {backup.commitSha || '-'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {modal?.mode === 'live' && (
                <LogModal
                    mode="live"
                    jobId={modal.jobId}
                    domain={modal.domain}
                    siteId={modal.siteId}
                    onClose={() => {
                        setModal(null);
                        router.refresh();
                    }}
                />
            )}
            {modal?.mode === 'history' && (
                <LogModal
                    mode="history"
                    backupId={modal.backup.id}
                    domain={modal.backup.site.domain}
                    siteId={modal.backup.siteId}
                    status={modal.backup.status}
                    startedAt={
                        modal.backup.startedAt
                            ? new Date(modal.backup.startedAt).toISOString()
                            : undefined
                    }
                    durationMs={modal.backup.durationMs}
                    filesDownloaded={modal.backup.filesDownloaded}
                    filesUnchanged={modal.backup.filesUnchanged}
                    dumpSizeBytes={modal.backup.dumpSizeBytes}
                    commitSha={modal.backup.commitSha}
                    fullDownload={modal.backup.fullDownload}
                    skipGit={modal.backup.skipGit}
                    onClose={() => setModal(null)}
                />
            )}
        </>
    );
}

function OptionsCell({ fullDownload, skipGit }: { fullDownload: boolean; skipGit: boolean }) {
    const labels = optionLabels(fullDownload, skipGit);
    if (labels.length === 0) return <span className="text-muted-foreground">-</span>;
    return (
        <div className="flex gap-1">
            {labels.map((label) => (
                <Badge key={label} variant="outline" className="text-xs">
                    {label}
                </Badge>
            ))}
        </div>
    );
}
