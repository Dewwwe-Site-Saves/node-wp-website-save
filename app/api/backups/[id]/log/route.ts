import { NextResponse } from 'next/server';
import { getBackupById } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const backup = getBackupById(parseInt(id));

    if (!backup) {
        return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    return NextResponse.json({
        id: backup.id,
        domain: backup.domain,
        status: backup.status,
        started_at: backup.started_at,
        finished_at: backup.finished_at,
        duration_ms: backup.duration_ms,
        files_downloaded: backup.files_downloaded,
        files_unchanged: backup.files_unchanged,
        dump_size_bytes: backup.dump_size_bytes,
        commit_sha: backup.commit_sha,
        options: backup.options,
        log: backup.log || '',
    });
}
