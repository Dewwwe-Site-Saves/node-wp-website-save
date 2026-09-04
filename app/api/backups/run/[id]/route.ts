import { NextResponse } from 'next/server';
import { jsonError, parseBody } from '@/lib/api';
import { getSite } from '@/lib/db';
import { backupQueue } from '@/lib/jobs/queue';
import { parseId, runBackupSchema } from '@/lib/validation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const id = parseId((await params).id);
    const site = id ? await getSite(id) : null;
    if (!site) return jsonError(404, 'Site not found');

    if (backupQueue.getRunningJobs().some((j) => j.siteId === site.id)) {
        return jsonError(409, 'Backup already running for this site');
    }

    const { data, response } = await parseBody(request, runBackupSchema);
    if (response) return response;

    const job = await backupQueue.enqueue(site.id, {
        fullDownload: data.fullDownload,
        skipGit: data.skipGit,
    });

    // Wait for the job to start and get its backupId (with timeout)
    const backupId = await Promise.race([
        job.started,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);

    return NextResponse.json({
        jobId: job.id,
        backupId,
        domain: job.domain,
        status: job.status,
    });
}
