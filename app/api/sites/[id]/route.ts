import { NextResponse } from 'next/server';
import { getSiteById, updateSite, deleteSite, getBackups } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const site = getSiteById(parseInt(id));
    if (!site) {
        return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const backups = getBackups({ siteId: parseInt(id), limit: 20 });
    return NextResponse.json({ site, backups });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const siteId = parseInt(id);

    const site = getSiteById(siteId);
    if (!site) {
        return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    const body = await request.json();

    const required = ['domain', 'repo', 'repo_url', 'host', 'username'];
    for (const field of required) {
        if (!body[field]?.trim()) {
            return NextResponse.json({ error: `${field} is required` }, { status: 400 });
        }
    }

    try {
        updateSite(siteId, {
            domain: body.domain.trim(),
            repo: body.repo.trim(),
            repo_url: body.repo_url.trim(),
            protocol: body.protocol || site.protocol,
            host: body.host.trim(),
            port: body.port || site.port,
            username: body.username.trim(),
            password: body.password || site.password,
            web_root_path: body.web_root_path?.trim() || 'www',
            ssh_key_path: body.ssh_key_path?.trim() || null,
            sp_list_item_id: body.sp_list_item_id?.trim() || null,
            cron_schedule: body.cron_schedule?.trim() || '0 3 * * *',
            enabled: body.enabled !== undefined ? (body.enabled ? 1 : 0) : site.enabled,
        });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const siteId = parseInt(id);

    const site = getSiteById(siteId);
    if (!site) {
        return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    try {
        deleteSite(siteId);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
