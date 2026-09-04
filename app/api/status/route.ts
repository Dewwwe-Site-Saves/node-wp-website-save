import { NextResponse } from 'next/server';
import { apiHandler } from '@/lib/api';
import { listActiveBackups } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Polled by the UI: what is executing and what waits in the queue. */
export const GET = apiHandler(async () => {
    const active = await listActiveBackups();
    return NextResponse.json({
        running: active.filter((b) => b.status === 'running'),
        pending: active.filter((b) => b.status === 'pending'),
    });
});
