import { NextResponse } from 'next/server';
import { listActiveBackups } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    const active = await listActiveBackups();
    const summary = ({ id, siteId, domain }: (typeof active)[number]) => ({ id, siteId, domain });
    return NextResponse.json({
        running: active.filter((b) => b.status === 'running').map(summary),
        pending: active.filter((b) => b.status === 'pending').map(summary),
    });
}
