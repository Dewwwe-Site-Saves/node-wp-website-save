import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { getBackup } from '@/lib/db';
import { cancel } from '@/lib/jobs/queue';
import { parseId } from '@/lib/validation';

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
    const id = parseId((await params).jobId);
    const backup = id ? await getBackup(id) : null;
    if (!backup) return jsonError(404, 'Backup not found');

    if (!(await cancel(backup.id))) {
        return jsonError(400, 'Backup cannot be cancelled (already finished)');
    }

    return NextResponse.json({ success: true, domain: backup.site.domain, backupId: backup.id });
}
