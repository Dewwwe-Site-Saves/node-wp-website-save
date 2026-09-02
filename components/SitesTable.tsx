'use client';

import { useRouter } from 'next/navigation';
import { RunBackupButton } from '@/components/BackupActions';
import { Badge } from '@/components/ui/badge';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

export function SitesTable({ sites }: { sites: any[] }) {
    const router = useRouter();

    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Domain</TableHead>
                        <TableHead className="hidden sm:table-cell">Host</TableHead>
                        <TableHead className="hidden lg:table-cell">Protocol</TableHead>
                        <TableHead className="hidden lg:table-cell">Repo</TableHead>
                        <TableHead className="hidden sm:table-cell">Schedule</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sites.map((site: any) => (
                        <TableRow key={site.id} className="cursor-pointer hover:bg-muted/50"
                            onClick={() => router.push(`/sites/${site.id}`)}>
                            <TableCell className="font-medium">{site.domain}</TableCell>
                            <TableCell className="hidden sm:table-cell text-muted-foreground">{site.host}</TableCell>
                            <TableCell className="hidden lg:table-cell">
                                <Badge variant="outline">{site.protocol.toUpperCase()}</Badge>
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-muted-foreground">{site.repo}</TableCell>
                            <TableCell className="hidden sm:table-cell text-muted-foreground font-mono text-xs">{site.cron_schedule}</TableCell>
                            <TableCell>
                                {site.enabled
                                    ? <Badge variant="default">Active</Badge>
                                    : <Badge variant="secondary">Disabled</Badge>
                                }
                            </TableCell>
                            <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                <RunBackupButton siteId={site.id} domain={site.domain} />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
