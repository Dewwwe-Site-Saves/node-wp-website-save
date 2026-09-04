import { listBackups } from '@/lib/db';
import { backupsQuerySchema } from '@/lib/validation';
import { BackupHistory } from '@/components/BackupHistory';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
    const backups = await listBackups(backupsQuerySchema.parse({ pageSize: 50 }));

    return (
        <div>
            <div className="mb-6">
                <h1 className="text-2xl font-bold">History</h1>
                <p className="text-sm text-muted-foreground mt-1">Backup execution history</p>
            </div>

            <Card>
                <CardContent className="p-0">
                    {backups.items.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <p>No backups have been run yet.</p>
                        </div>
                    ) : (
                        <BackupHistory backups={backups.items} showDomain={true} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
