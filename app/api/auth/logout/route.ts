import { NextResponse } from 'next/server';
import { apiHandler } from '@/lib/api';
import { closeSession } from '@/lib/session';

/** Public: a stale cookie can always be cleared. */
export const POST = apiHandler(async () => {
    await closeSession();
    return NextResponse.json({ success: true });
});
