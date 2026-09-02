'use client';

import { Button } from '@/components/ui/button';
import { LogModal } from '@/components/LogModal';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function RunBackupButton({ siteId, domain, size = 'sm' }: { siteId: number; domain?: string; size?: 'sm' | 'default' }) {
    const [showModal, setShowModal] = useState(false);
    const router = useRouter();

    return (
        <>
            <Button variant="outline" size={size} onClick={() => setShowModal(true)}>
                Run Backup
            </Button>
            {showModal && (
                <LogModal mode="run" siteId={siteId} domain={domain || `Site #${siteId}`}
                    onClose={() => { setShowModal(false); router.refresh(); }} />
            )}
        </>
    );
}

export function RunAllButton() {
    const [loading, setLoading] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const router = useRouter();

    useEffect(() => {
        if (!isRunning) return;
        const interval = setInterval(async () => {
            try {
                const res = await fetch('/api/backups/status');
                const data = await res.json();
                if (data.running.length === 0 && data.pending.length === 0) {
                    setIsRunning(false);
                    setLoading(false);
                    router.refresh();
                }
            } catch { /* ignore */ }
        }, 3000);
        return () => clearInterval(interval);
    }, [isRunning]);

    async function handleRunAll() {
        setLoading(true);
        try {
            await fetch('/api/backups/run', { method: 'POST' });
            setIsRunning(true);
        } catch {
            setLoading(false);
        }
    }

    return (
        <Button onClick={handleRunAll} disabled={loading}>
            {loading ? 'Running...' : 'Backup All'}
        </Button>
    );
}
