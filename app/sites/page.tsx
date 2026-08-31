import { getAllSites } from '@/lib/db';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function SitesPage() {
    const sites = getAllSites();

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Sites</h1>
                    <p className="text-sm text-muted-foreground mt-1">Manage your WordPress sites</p>
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
                            <Link href="/sites/new" className="text-primary hover:underline">Add your first site</Link>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Domain</TableHead>
                                    <TableHead>Host</TableHead>
                                    <TableHead>Protocol</TableHead>
                                    <TableHead>Repo</TableHead>
                                    <TableHead>Schedule</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sites.map((site: any) => (
                                    <TableRow key={site.id}>
                                        <TableCell className="font-medium">{site.domain}</TableCell>
                                        <TableCell className="text-muted-foreground">{site.host}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">{site.protocol.toUpperCase()}</Badge>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground">{site.repo}</TableCell>
                                        <TableCell className="text-muted-foreground font-mono text-xs">{site.cron_schedule}</TableCell>
                                        <TableCell>
                                            {site.enabled
                                                ? <Badge variant="default">Active</Badge>
                                                : <Badge variant="secondary">Disabled</Badge>
                                            }
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Link href={`/sites/${site.id}`}>
                                                <Button variant="ghost" size="sm">Edit</Button>
                                            </Link>
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
