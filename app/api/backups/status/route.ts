import { NextResponse } from 'next/server';
import { backupQueue } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json({
        running: backupQueue
            .getRunningJobs()
            .map((j) => ({ id: j.id, siteId: j.siteId, domain: j.domain })),
        pending: backupQueue
            .getPendingJobs()
            .map((j) => ({ id: j.id, siteId: j.siteId, domain: j.domain })),
    });
}
