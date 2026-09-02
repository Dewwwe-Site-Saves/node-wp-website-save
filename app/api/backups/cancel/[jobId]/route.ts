import { NextResponse } from 'next/server';
import { backupQueue } from '@/lib/queue';

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
    const { jobId } = await params;
    const id = parseInt(jobId);

    const job = backupQueue.getJob(id);
    if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const cancelled = backupQueue.cancelJob(id);
    if (!cancelled) {
        return NextResponse.json({ error: 'Job cannot be cancelled (already finished)' }, { status: 400 });
    }

    return NextResponse.json({ success: true, domain: job.domain, jobId: id });
}
