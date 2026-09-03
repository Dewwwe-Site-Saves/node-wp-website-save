import { NextResponse } from 'next/server';
import path from 'path';
import { fileURLToPath } from 'url';
import { jsonError } from '@/lib/api';
import { listSites } from '@/lib/db';
import { backupQueue } from '@/lib/queue';

// v1 engine layout (files/ and helpers/ under the project root). Replaced by DATA_DIR in Phase 2.
const basePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

export async function POST() {
    const sites = (await listSites()).filter(site => site.enabled);
    if (sites.length === 0) {
        return jsonError(400, 'No active sites');
    }

    const jobs = [];
    for (const site of sites) {
        if (backupQueue.getRunningJobs().some(j => j.siteId === site.id)) continue;

        const job = await backupQueue.enqueue(site.id, basePath);
        jobs.push({ jobId: job.id, domain: job.domain, status: job.status });
    }

    return NextResponse.json({ jobs });
}
