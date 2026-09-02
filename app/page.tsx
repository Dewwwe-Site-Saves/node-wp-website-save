import { getLastBackupPerSite } from '@/lib/db';
import { SiteCard } from '@/components/SiteCard';
import { RunAllButton } from '@/components/BackupActions';

export const dynamic = 'force-dynamic';

export default function Dashboard() {
    const sites = getLastBackupPerSite();

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Dashboard</h1>
                    <p className="text-sm text-muted-foreground mt-1">{sites.length} site{sites.length !== 1 ? 's' : ''} configured</p>
                </div>
                {sites.length > 0 && <RunAllButton />}
            </div>

            {sites.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                    <p>No sites configured yet.</p>
                    <a href="/sites/new" className="text-primary hover:underline">Add your first site</a>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sites.map((site: any) => (
                        <SiteCard key={site.id} site={site} />
                    ))}
                </div>
            )}
        </div>
    );
}
