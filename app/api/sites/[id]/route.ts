import { NextResponse } from 'next/server';
import { jsonError, parseBody } from '@/lib/api';
import { deleteSite, getSite, isUniqueViolation, listBackups, updateSite } from '@/lib/db';
import { backupsQuerySchema, parseId, siteUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
    const id = parseId((await params).id);
    const site = id ? await getSite(id) : null;
    if (!site) return jsonError(404, 'Site not found');

    const backups = await listBackups(backupsQuerySchema.parse({ siteId: site.id, pageSize: 20 }));
    return NextResponse.json({ site, backups: backups.items });
}

export async function PUT(request: Request, { params }: Params) {
    const id = parseId((await params).id);
    const site = id ? await getSite(id) : null;
    if (!site) return jsonError(404, 'Site not found');

    const { data, response } = await parseBody(request, siteUpdateSchema);
    if (response) return response;

    try {
        return NextResponse.json(await updateSite(site.id, data));
    } catch (error) {
        if (isUniqueViolation(error)) {
            return jsonError(409, 'A site with this domain or repository name already exists');
        }
        throw error;
    }
}

export async function DELETE(request: Request, { params }: Params) {
    const id = parseId((await params).id);
    const site = id ? await getSite(id) : null;
    if (!site) return jsonError(404, 'Site not found');

    await deleteSite(site.id);
    return NextResponse.json({ success: true });
}
