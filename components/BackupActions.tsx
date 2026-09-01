'use client';

import { Button } from '@/components/ui/button';
import { LiveLog } from '@/components/LiveLog';
import { LogPanel } from '@/components/LogPanel';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface RunningJob {
    jobId: number;
    domain: string;
}

export function RunBackupButton({ siteId, domain, size = 'sm' }: { siteId: number; domain?: string; size?: 'sm' | 'default' }) {
    const [job, setJob] = useState<RunningJob | null>(null);
    const router = useRouter();

    async function handleRun() {
        try {
            const res = await fetch(`/api/backups/run/${siteId}`, { method: 'POST' });
            const data = await res.json();
            if (data.jobId) {
                setJob({ jobId: data.jobId, domain: data.domain });
            }
        } catch (error) {
            console.error('Failed to start backup:', error);
        }
    }

    return (
        <>
            <Button variant="outline" size={size} onClick={handleRun} disabled={!!job}>
                {job ? 'Running...' : 'Run Backup'}
            </Button>
            {job && (
                <LogPanel onClose={() => { setJob(null); router.refresh(); }}>
                    <LiveLog jobId={job.jobId} domain={job.domain} />
                </LogPanel>
            )}
        </>
    );
}

export function RunAllButton() {
    const [jobs, setJobs] = useState<RunningJob[]>([]);
    const router = useRouter();

    async function handleRunAll() {
        try {
            const res = await fetch('/api/backups/run', { method: 'POST' });
            const data = await res.json();
            if (data.jobs?.length > 0) {
                setJobs(data.jobs.map((j: any) => ({ jobId: j.jobId, domain: j.domain })));
            }
        } catch (error) {
            console.error('Failed to start backups:', error);
        }
    }

    return (
        <>
            <Button onClick={handleRunAll} disabled={jobs.length > 0}>
                {jobs.length > 0 ? 'Running...' : 'Backup All'}
            </Button>
            {jobs.length > 0 && (
                <LogPanel onClose={() => { setJobs([]); router.refresh(); }}>
                    <div className="space-y-4">
                        {jobs.map(job => (
                            <LiveLog key={job.jobId} jobId={job.jobId} domain={job.domain} />
                        ))}
                    </div>
                </LogPanel>
            )}
        </>
    );
}
