import { getSiteById } from '@/lib/db';
import { notFound } from 'next/navigation';
import { SiteForm } from '@/components/SiteForm';

export const dynamic = 'force-dynamic';

export default async function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const site = getSiteById(parseInt(id));
    if (!site) notFound();

    return (
        <div className="max-w-3xl">
            <h1 className="text-2xl font-bold mb-6">Edit — {site.domain}</h1>
            <SiteForm site={{ ...site, password: '' }} mode="edit" />
        </div>
    );
}
