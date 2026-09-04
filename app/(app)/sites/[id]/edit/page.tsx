import { notFound } from 'next/navigation';
import { getSite } from '@/lib/db';
import { parseId } from '@/lib/validation';
import { SiteForm } from '@/components/SiteForm';

export const dynamic = 'force-dynamic';

export default async function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
    const id = parseId((await params).id);
    const site = id ? await getSite(id) : null;
    if (!site) notFound();

    return (
        <div className="max-w-3xl">
            <h1 className="text-2xl font-bold mb-6">Edit — {site.domain}</h1>
            <SiteForm site={site} mode="edit" />
        </div>
    );
}
