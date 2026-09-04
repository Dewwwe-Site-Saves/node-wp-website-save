import { NextResponse } from 'next/server';
import { listActiveBackups } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    const active = await listActiveBackups();
    return NextResponse.json({
        running: active.filter((b) => b.status === 'running'),
        pending: active.filter((b) => b.status === 'pending'),
    });
}
