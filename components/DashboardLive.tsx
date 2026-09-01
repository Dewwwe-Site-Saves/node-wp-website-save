'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LiveLog } from '@/components/LiveLog';
import { LogPanel } from '@/components/LogPanel';

interface Job {
    id: number;
    siteId: number;
    domain: string;
}

interface QueueStatus {
    running: Job[];
    pending: Job[];
}

export function DashboardLive({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<QueueStatus>({ running: [], pending: [] });
    const [showLogs, setShowLogs] = useState(false);
    const router = useRouter();

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/backups/status');
            const data = await res.json();
            setStatus(data);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(async () => {
            try {
                const res = await fetch('/api/backups/status');
                const data = await res.json();
                const wasRunning = status.running.length > 0 || status.pending.length > 0;
                const isRunning = data.running.length > 0 || data.pending.length > 0;
                setStatus(data);

                if (wasRunning && !isRunning) {
                    router.refresh();
                    setShowLogs(false);
                }
                if (isRunning) {
                    router.refresh();
                }
            } catch { /* ignore */ }
        }, 3000);

        return () => clearInterval(interval);
    }, [status.running.length, status.pending.length]);

    const active = status.running.length + status.pending.length;

    return (
        <div>
            {active > 0 && (
                <div className="mb-4 p-3 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                        <span className="text-sm">
                            {status.running.length > 0 && (
                                <>Running: {status.running.map(j => j.domain).join(', ')}</>
                            )}
                            {status.pending.length > 0 && (
                                <span className="text-muted-foreground ml-2">
                                    ({status.pending.length} pending)
                                </span>
                            )}
                        </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setShowLogs(!showLogs)}>
                        {showLogs ? 'Hide Logs' : 'View Logs'}
                    </Button>
                </div>
            )}

            {showLogs && status.running.length > 0 && (
                <LogPanel onClose={() => setShowLogs(false)}>
                    <div className="space-y-4">
                        {status.running.map(job => (
                            <LiveLog key={job.id} jobId={job.id} domain={job.domain} />
                        ))}
                    </div>
                </LogPanel>
            )}

            {children}
        </div>
    );
}

export function RunningBadge({ siteId }: { siteId: number }) {
    const [isRunning, setIsRunning] = useState(false);

    useEffect(() => {
        const check = async () => {
            try {
                const res = await fetch('/api/backups/status');
                const data = await res.json();
                setIsRunning(
                    data.running.some((j: Job) => j.siteId === siteId) ||
                    data.pending.some((j: Job) => j.siteId === siteId)
                );
            } catch { /* ignore */ }
        };
        check();
        const interval = setInterval(check, 3000);
        return () => clearInterval(interval);
    }, [siteId]);

    if (!isRunning) return null;

    return (
        <Badge variant="outline" className="animate-pulse border-primary text-primary">
            RUNNING
        </Badge>
    );
}
