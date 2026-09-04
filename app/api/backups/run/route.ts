import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { listSites } from '@/lib/db';
import { BackupConflictError, enqueue } from '@/lib/jobs/queue';

export async function POST() {
    const sites = (await listSites()).filter((site) => site.enabled);
    if (sites.length === 0) {
        return jsonError(400, 'No active sites');
    }

    const queued: { backupId: number; domain: string }[] = [];
    const conflicts: { siteId: number; domain: string }[] = [];
    for (const site of sites) {
        try {
            queued.push({ backupId: await enqueue(site.id), domain: site.domain });
        } catch (error) {
            if (!(error instanceof BackupConflictError)) throw error;
            conflicts.push({ siteId: site.id, domain: site.domain });
        }
    }

    return NextResponse.json({ queued, conflicts });
}
