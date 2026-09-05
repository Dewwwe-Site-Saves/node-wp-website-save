'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SidebarStatus } from '@/components/SidebarStatus';

export interface SidebarUser {
    email: string;
    role: string;
}

const LINKS = [
    { href: '/', label: 'Dashboard' },
    { href: '/sites', label: 'Sites' },
    { href: '/history', label: 'History' },
    { href: '/settings', label: 'Settings' },
];

export function Sidebar({
    user,
    open,
    onClose,
}: {
    user: SidebarUser;
    open: boolean;
    onClose: () => void;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const [signingOut, setSigningOut] = useState(false);

    async function handleSignOut() {
        setSigningOut(true);
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } finally {
            router.push('/login');
            router.refresh();
        }
    }

    return (
        <nav
            className={`
            fixed md:static inset-y-0 left-0 z-40 md:h-full overflow-y-auto
            w-56 bg-slate-900 text-white flex flex-col shrink-0
            transform transition-transform duration-200 ease-in-out
            ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}
        >
            <div className="px-5 py-5 border-b border-slate-700 hidden md:block">
                <h2 className="text-base font-semibold">Reposite</h2>
            </div>
            <div className="flex flex-col gap-0.5 mt-14 md:mt-2 px-2 flex-1">
                {LINKS.map((link) => {
                    const isActive =
                        link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);

                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={onClose}
                            className={`px-3 py-2 text-sm rounded-md transition-colors no-underline ${
                                isActive
                                    ? 'bg-slate-800 text-white font-medium'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                        >
                            {link.label}
                        </Link>
                    );
                })}
            </div>
            <div className="pb-4">
                <SidebarStatus />
                <div className="mx-2 px-3 pt-3 border-t border-slate-700 flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400 truncate" title={user.email}>
                        {user.email}
                    </span>
                    <button
                        type="button"
                        onClick={handleSignOut}
                        disabled={signingOut}
                        className="text-xs text-slate-400 hover:text-white cursor-pointer shrink-0 disabled:opacity-50"
                    >
                        Sign out
                    </button>
                </div>
            </div>
        </nav>
    );
}
