import { getBackups } from '@/lib/db';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function HistoryPage() {
    const backups = getBackups({ limit: 50 });

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold">History</h1>
                <p className="text-sm text-muted-foreground mt-1">Backup execution history</p>
            </div>

            <Card>
                <CardContent className="p-0">
                    {backups.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <p>No backups have been run yet.</p>
                            <p className="text-sm">Run a backup from the <Link href="/" className="text-primary hover:underline">Dashboard</Link> to see results here.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Site</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Started</TableHead>
                                    <TableHead>Duration</TableHead>
                                    <TableHead>Files</TableHead>
                                    <TableHead>Dump</TableHead>
                                    <TableHead>Commit</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {backups.map((backup: any) => (
                                    <TableRow key={backup.id}>
                                        <TableCell className="font-medium">{backup.domain}</TableCell>
                                        <TableCell>
                                            <StatusBadge status={backup.status} />
                                        </TableCell>
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
    );
}

function formatDuration(ms: number): string {
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}m ${remainSecs}s`;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
