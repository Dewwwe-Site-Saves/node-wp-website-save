import { NextResponse } from 'next/server';
import { getAllSites, createSite, getSiteByDomain } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    const sites = getAllSites();
    return NextResponse.json(sites);
}

export async function POST(request: Request) {
    const body = await request.json();

    const required = ['domain', 'repo', 'repo_url', 'host', 'username', 'password'];
    for (const field of required) {
        if (!body[field]?.trim()) {
            return NextResponse.json({ error: `${field} is required` }, { status: 400 });
        }
    }

    const existing = getSiteByDomain(body.domain);
    if (existing) {
        return NextResponse.json({ error: 'A site with this domain already exists' }, { status: 400 });
    }

    try {
        const result = createSite({
            domain: body.domain.trim(),
            repo: body.repo.trim(),
            repo_url: body.repo_url.trim(),
            protocol: body.protocol || 'ftp',
            host: body.host.trim(),
            port: body.port || (body.protocol === 'sftp' ? 22 : 21),
            username: body.username.trim(),
            password: body.password,
            web_root_path: body.web_root_path?.trim() || 'www',
            ssh_key_path: body.ssh_key_path?.trim() || null,
            sp_list_item_id: body.sp_list_item_id?.trim() || null,
            cron_schedule: body.cron_schedule?.trim() || '0 3 * * *',
            enabled: body.enabled !== undefined ? (body.enabled ? 1 : 0) : 1,
        });
        return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
