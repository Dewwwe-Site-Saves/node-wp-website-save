import { NextResponse } from 'next/server';
import { backupQueue } from '@/lib/queue';
import { getAllSites } from '@/lib/db';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const basePath = path.resolve(path.dirname(__filename), '../../../..');

export async function POST() {
    const sites = getAllSites().filter((s: any) => s.enabled);

    if (sites.length === 0) {
        return NextResponse.json({ error: 'No active sites' }, { status: 400 });
    }

    const jobs = [];
    for (const site of sites) {
        // Skip if already running
        const running = backupQueue.getRunningJobs();
        if (running.some(j => j.siteId === site.id)) continue;

        const job = backupQueue.enqueue(site.id, basePath);
        jobs.push({ jobId: job.id, domain: job.domain, status: job.status });
    }

    return NextResponse.json({ jobs });
}
