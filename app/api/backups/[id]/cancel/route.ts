import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import { getBackup } from '@/lib/db';
import { cancel } from '@/lib/jobs/queue';
import { parseId } from '@/lib/validation';

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
    const id = parseId((await params).jobId);
    if (!id) return jsonError(404, 'Backup not found');

    // The queue is asked first: a run whose site was deleted has no row any more but is still cancellable.
    if (await cancel(id)) {
        return NextResponse.json({ success: true, backupId: id });
    }
    const backup = await getBackup(id);
    if (!backup) return jsonError(404, 'Backup not found');
    return jsonError(400, 'Backup cannot be cancelled (already finished)');
}
