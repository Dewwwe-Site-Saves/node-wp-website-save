import { NextResponse } from 'next/server';
import { apiHandler, jsonError, parseBody } from '@/lib/api';
import { createSite, isUniqueViolation, listSites } from '@/lib/db';
import * as scheduler from '@/lib/jobs/scheduler';
import { requireRole } from '@/lib/session';
import { siteCreateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async () => {
    return NextResponse.json(await listSites());
});

export const POST = apiHandler(async (request: Request) => {
    await requireRole('admin');
    const { data, response } = await parseBody(request, siteCreateSchema);
    if (response) return response;

    try {
        const site = await createSite(data);
        await scheduler.reload();
        return NextResponse.json(site, { status: 201 });
    } catch (error) {
        if (isUniqueViolation(error)) {
            return jsonError(409, 'A site with this domain or repository name already exists');
        }
        throw error;
    }
});
