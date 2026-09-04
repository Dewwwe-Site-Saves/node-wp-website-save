'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export function SidebarStatus() {
    const [count, setCount] = useState(0);
    const [prevCount, setPrevCount] = useState(0);
    const router = useRouter();

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const res = await fetch('/api/backups/status');
                const data = await res.json();
                const total = data.running.length + data.pending.length;
                setPrevCount(count);
                setCount(total);
            } catch {
                /* ignore */
            }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (prevCount > 0 && count === 0) {
            router.refresh();
        }
    }, [count, prevCount]);

    if (count === 0) return null;

    return (
        <Link href="/history" className="no-underline block mb-4">
            <div className="mx-2 px-3 py-3 rounded-md bg-primary/15 border border-primary/30 flex items-center gap-3 cursor-pointer hover:bg-primary/25 transition-colors">
                <svg
                    className="h-4 w-4 text-primary animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                >
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
                <span className="text-sm font-medium text-primary">
                    {count} backup{count > 1 ? 's' : ''} running
                </span>
            </div>
        </Link>
    );
}
