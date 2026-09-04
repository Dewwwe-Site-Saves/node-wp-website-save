import { NextResponse } from 'next/server';
import { jsonError, parseBody } from '@/lib/api';
import { getSite } from '@/lib/db';
import { BackupConflictError, enqueue } from '@/lib/jobs/queue';
import { parseId, runBackupSchema } from '@/lib/validation';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const id = parseId((await params).id);
    const site = id ? await getSite(id) : null;
    if (!site) return jsonError(404, 'Site not found');

    const { data, response } = await parseBody(request, runBackupSchema);
    if (response) return response;

    try {
        const backupId = await enqueue(site.id, {
            fullDownload: data.fullDownload,
            skipGit: data.skipGit,
        });
        return NextResponse.json({ backupId, domain: site.domain, status: 'pending' });
    } catch (error) {
        if (error instanceof BackupConflictError) {
            return jsonError(409, 'Backup already pending or running for this site');
        }
        throw error;
    }
}
