import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteForm } from '@/components/SiteForm';
import { getSettings, getSite } from '@/lib/db';
import { parseId } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Edit site' };

export default async function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
    const id = parseId((await params).id);
    const site = id ? await getSite(id) : null;
    if (!site) notFound();

    const { defaultCron } = await getSettings();

    return (
        <div className="max-w-3xl">
            <h1 className="text-2xl font-bold mb-6">Edit — {site.domain}</h1>
            <SiteForm site={site} mode="edit" defaultCron={defaultCron} />
        </div>
    );
}
