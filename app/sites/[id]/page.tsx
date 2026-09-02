import { getSiteById, getBackups } from '@/lib/db';
import { notFound } from 'next/navigation';
import { RunBackupButton } from '@/components/BackupActions';
import { BackupHistory } from '@/components/BackupHistory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SiteDetailActions } from './actions';

export const dynamic = 'force-dynamic';

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const site = getSiteById(parseInt(id));
    if (!site) notFound();

    const backups = getBackups({ siteId: site.id, limit: 20 });

    return (
        <div className="max-w-4xl">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold">{site.domain}</h1>
                    {site.enabled
                        ? <Badge variant="default">Active</Badge>
                        : <Badge variant="secondary">Disabled</Badge>
                    }
                </div>
                <div className="flex gap-2">
                    <RunBackupButton siteId={site.id} domain={site.domain} size="default" />
                    <SiteDetailActions siteId={site.id} />
                </div>
            </div>

            <div className="space-y-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base">Configuration</CardTitle>
                        <a href={`/sites/${site.id}/edit`}>
                            <span className="text-sm text-primary hover:underline cursor-pointer">Edit</span>
                        </a>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-8 text-sm">
                            <div>
                                <span className="text-muted-foreground">Protocol</span>
                                <p className="font-medium">{site.protocol.toUpperCase()}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Host</span>
                                <p className="font-medium">{site.host}:{site.port}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Username</span>
                                <p className="font-medium">{site.username}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Web root</span>
                                <p className="font-medium">{site.web_root_path}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Repository</span>
                                <p className="font-medium">{site.repo}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Schedule</span>
                                <p className="font-medium font-mono text-xs">{site.cron_schedule}</p>
                            </div>
                            {site.sp_list_item_id && (
                                <div>
                                    <span className="text-muted-foreground">SharePoint ID</span>
                                    <p className="font-medium">{site.sp_list_item_id}</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Backup History</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {backups.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No backups yet. Click "Run Backup" to start.
                            </div>
                        ) : (
                            <BackupHistory backups={backups} showDomain={false} siteId={site.id} />
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
