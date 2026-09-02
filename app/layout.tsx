'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarStatus } from '@/components/SidebarStatus';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <body className="min-h-screen bg-background antialiased">
                <div className="flex min-h-screen">
                    {/* Mobile header */}
                    <div className="fixed top-0 left-0 right-0 z-40 md:hidden bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
                        <h2 className="text-sm font-semibold text-white">WP Backup Manager</h2>
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-400 hover:text-white cursor-pointer">
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                {sidebarOpen
                                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                                }
                            </svg>
                        </button>
                    </div>

                    {/* Sidebar overlay on mobile */}
                    {sidebarOpen && (
                        <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
                    )}

                    {/* Sidebar */}
                    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

                    <main className="flex-1 p-4 sm:p-6 md:p-8 bg-muted/30 pt-16 md:pt-8">
                        {children}
                    </main>
                </div>
            </body>
        </html>
    );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
    const pathname = usePathname();

    const links = [
        { href: '/', label: 'Dashboard' },
        { href: '/sites', label: 'Sites' },
        { href: '/history', label: 'History' },
        { href: '/settings', label: 'Settings' },
    ];

    return (
        <nav className={`
            fixed md:static inset-y-0 left-0 z-40
            w-56 bg-slate-900 text-white flex flex-col shrink-0
            transform transition-transform duration-200 ease-in-out
            ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}>
            <div className="px-5 py-5 border-b border-slate-700 hidden md:block">
                <h2 className="text-base font-semibold">WP Backup Manager</h2>
            </div>
            <div className="flex flex-col gap-0.5 mt-14 md:mt-2 px-2 flex-1">
                {links.map(link => {
                    const isActive = link.href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(link.href);

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
            </div>
        </nav>
    );
}
