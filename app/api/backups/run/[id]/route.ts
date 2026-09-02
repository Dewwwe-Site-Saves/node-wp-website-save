import { NextResponse } from 'next/server';
import { backupQueue } from '@/lib/queue';
import { getSiteById } from '@/lib/db';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const basePath = path.resolve(path.dirname(__filename), '../../../../..');

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const siteId = parseInt(id);

    const site = getSiteById(siteId);
    if (!site) {
        return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Check if already running
    const running = backupQueue.getRunningJobs();
    if (running.some(j => j.siteId === siteId)) {
        return NextResponse.json({ error: 'Backup already running for this site' }, { status: 409 });
    }

    let body: any = {};
    try { body = await request.json(); } catch { /* no body */ }

    const job = backupQueue.enqueue(siteId, basePath, {
        fullDownload: !!body.fullDownload,
        skipGit: !!body.skipGit,
    });

    // Wait for the job to start and get its backupId (with timeout)
    const backupId = await Promise.race([
        job.started,
        new Promise(r => setTimeout(() => r(null), 5000)),
    ]);

    return NextResponse.json({
        jobId: job.id,
        backupId,
        domain: job.domain,
        status: job.status,
    });
}
