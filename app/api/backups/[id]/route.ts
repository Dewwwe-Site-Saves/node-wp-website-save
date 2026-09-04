import { NextResponse } from 'next/server';
import { apiHandler, jsonError } from '@/lib/api';
import { getBackup } from '@/lib/db';
import { parseId } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Full detail of one backup, log included. */
export const GET = apiHandler(
    async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
        const id = parseId((await params).id);
        const backup = id ? await getBackup(id) : null;
        if (!backup) return jsonError(404, 'Backup not found');

        const { site, log, ...row } = backup;
        return NextResponse.json({ ...row, domain: site.domain, log: log ?? '' });
    },
);
