import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
    status: string | null;
}

export function StatusBadge({ status }: StatusBadgeProps) {
    if (!status) {
        return <Badge variant="outline">PENDING</Badge>;
    }

    const variant =
        status === 'success'
            ? 'default'
            : status === 'error'
              ? 'destructive'
              : status === 'cancelled'
                ? 'outline'
                : 'secondary';

    return <Badge variant={variant}>{status.toUpperCase()}</Badge>;
}
