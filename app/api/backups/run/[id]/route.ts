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

    const job = backupQueue.enqueue(siteId, basePath);

    return NextResponse.json({
        jobId: job.id,
        domain: job.domain,
        status: job.status,
    });
}
