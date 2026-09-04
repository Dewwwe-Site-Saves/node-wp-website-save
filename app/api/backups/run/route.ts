import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { listSites } from '@/lib/db';
import { backupQueue } from '@/lib/jobs/queue';

export async function POST() {
    const sites = (await listSites()).filter((site) => site.enabled);
    if (sites.length === 0) {
        return jsonError(400, 'No active sites');
    }

    const jobs = [];
    for (const site of sites) {
        if (backupQueue.getRunningJobs().some((j) => j.siteId === site.id)) continue;

        const job = await backupQueue.enqueue(site.id);
        jobs.push({ jobId: job.id, domain: job.domain, status: job.status });
    }

    return NextResponse.json({ jobs });
}
