import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { getBackup } from '@/lib/db';
import { parseId } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const id = parseId((await params).id);
    const backup = id ? await getBackup(id) : null;
    if (!backup) return jsonError(404, 'Backup not found');

    return NextResponse.json({
        id: backup.id,
        siteId: backup.siteId,
        domain: backup.site.domain,
        status: backup.status,
        triggerType: backup.triggerType,
        fullDownload: backup.fullDownload,
        skipGit: backup.skipGit,
        queuedAt: backup.queuedAt,
        startedAt: backup.startedAt,
        finishedAt: backup.finishedAt,
        durationMs: backup.durationMs,
        filesDownloaded: backup.filesDownloaded,
        filesUnchanged: backup.filesUnchanged,
        filesDeleted: backup.filesDeleted,
        dumpSizeBytes: backup.dumpSizeBytes,
        commitSha: backup.commitSha,
        errorMessage: backup.errorMessage,
        log: backup.log ?? '',
    });
}
