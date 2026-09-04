import { listSites } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SitesTable } from '@/components/SitesTable';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function SitesPage() {
    const sites = await listSites();

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Sites</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage your WordPress sites
                    </p>
                </div>
                <Link href="/sites/new">
                    <Button>Add Site</Button>
                </Link>
            </div>

            <Card>
                <CardContent className="p-0">
                    {sites.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <p>No sites configured yet.</p>
                            <Link href="/sites/new" className="text-primary hover:underline">
                                Add your first site
                            </Link>
                        </div>
                    ) : (
                        <SitesTable sites={sites} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
