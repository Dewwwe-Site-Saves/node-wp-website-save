import type { Metadata } from 'next';
import { SiteForm } from '@/components/SiteForm';
import { getSettings } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Add site' };

export default async function NewSitePage() {
    const { defaultCron } = await getSettings();

    return (
        <div className="max-w-3xl">
            <h1 className="text-2xl font-bold mb-6">Add Site</h1>
            <SiteForm mode="create" defaultCron={defaultCron} />
        </div>
    );
}
