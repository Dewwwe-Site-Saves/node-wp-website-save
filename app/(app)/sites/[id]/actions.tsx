'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function SiteDetailActions({ siteId }: { siteId: number }) {
    const router = useRouter();
    const [deleting, setDeleting] = useState(false);

    async function handleDelete() {
        if (!confirm('Are you sure you want to delete this site? All backup history will be lost.'))
            return;

        setDeleting(true);
        try {
            const res = await fetch(`/api/sites/${siteId}`, { method: 'DELETE' });
            if (res.ok) {
                router.push('/sites');
                router.refresh();
            }
        } catch {
            setDeleting(false);
        }
    }

    return (
        <Button variant="destructive" size="default" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete'}
        </Button>
    );
}
