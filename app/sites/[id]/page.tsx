import { getSiteById, getBackups } from '@/lib/db';
import { notFound } from 'next/navigation';
import { StatusBadge } from '@/components/StatusBadge';
import { RunBackupButton } from '@/components/BackupActions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
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
                        <div className="grid grid-cols-2 gap-y-3 gap-x-8 text-sm">
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
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Duration</TableHead>
                                        <TableHead>Files</TableHead>
                                        <TableHead>Dump</TableHead>
                                        <TableHead>Commit</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {backups.map((backup: any) => (
                                        <TableRow key={backup.id}>
                                            <TableCell><StatusBadge status={backup.status} /></TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {new Date(backup.started_at).toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {backup.duration_ms ? formatDuration(backup.duration_ms) : '-'}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {backup.files_downloaded != null ? backup.files_downloaded : '-'}
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">
                                                {backup.dump_size_bytes ? formatSize(backup.dump_size_bytes) : '-'}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {backup.commit_sha || '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

function formatDuration(ms: number): string {
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
