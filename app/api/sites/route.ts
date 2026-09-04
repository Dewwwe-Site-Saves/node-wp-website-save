import { NextResponse } from 'next/server';
import { jsonError, parseBody } from '@/lib/api';
import { createSite, isUniqueViolation, listSites } from '@/lib/db';
import * as scheduler from '@/lib/jobs/scheduler';
import { siteCreateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET() {
    return NextResponse.json(await listSites());
}

export async function POST(request: Request) {
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
}
