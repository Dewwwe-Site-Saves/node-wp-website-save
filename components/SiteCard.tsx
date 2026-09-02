import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/StatusBadge';

interface SiteCardProps {
    site: {
        id: number;
        domain: string;
        protocol: string;
        last_status: string | null;
        last_backup_at: string | null;
        last_duration_ms: number | null;
        last_commit_sha: string | null;
    };
}

export function SiteCard({ site }: SiteCardProps) {
    const lastBackup = site.last_backup_at
        ? new Date(site.last_backup_at).toLocaleString()
        : 'Never';

    const duration = site.last_duration_ms
        ? formatDuration(site.last_duration_ms)
        : '-';

    return (
        <Link href={`/sites/${site.id}`} className="no-underline">
            <Card className="border-l-4 hover:bg-muted/50 transition-colors cursor-pointer" style={{ borderLeftColor: statusColor(site.last_status) }}>
                <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{site.domain}</CardTitle>
                        <StatusBadge status={site.last_status} />
                    </div>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                    <div>Last backup: {lastBackup}</div>
                    <div>Duration: {duration}</div>
                    <div>Protocol: {site.protocol.toUpperCase()}</div>
                </CardContent>
            </Card>
        </Link>
    );
}

function statusColor(status: string | null): string {
    if (!status) return 'var(--border)';
    if (status === 'success') return '#22c55e';
    if (status === 'error') return '#ef4444';
    return '#f59e0b';
}

function formatDuration(ms: number): string {
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}m ${remainSecs}s`;
}
