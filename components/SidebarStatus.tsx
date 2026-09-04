'use client';

import Link from 'next/link';
import { useJobStatus } from '@/components/JobStatusProvider';

export function SidebarStatus() {
    const { running, pending } = useJobStatus();
    const count = running.length + pending.length;
    if (count === 0) return null;

    const label =
        running.length > 0
            ? `${running.length} backup${running.length > 1 ? 's' : ''} running`
            : `${pending.length} backup${pending.length > 1 ? 's' : ''} queued`;

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
                <div className="text-sm font-medium text-primary">
                    {label}
                    {running.length > 0 && pending.length > 0 && (
                        <span className="block text-xs font-normal opacity-80">
                            {pending.length} queued
                        </span>
                    )}
                </div>
            </div>
        </Link>
    );
}
