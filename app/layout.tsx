'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className="min-h-screen bg-background antialiased">
                <div className="flex min-h-screen">
                    <Sidebar />
                    <main className="flex-1 p-8 bg-muted/30">
                        {children}
                    </main>
                </div>
            </body>
        </html>
    );
}

function Sidebar() {
    const pathname = usePathname();

    const links = [
        { href: '/', label: 'Dashboard' },
        { href: '/sites', label: 'Sites' },
        { href: '/history', label: 'History' },
        { href: '/settings', label: 'Settings' },
    ];

    return (
        <nav className="w-56 bg-slate-900 text-white flex flex-col shrink-0">
            <div className="px-5 py-5 border-b border-slate-700">
                <h2 className="text-base font-semibold">WP Backup Manager</h2>
            </div>
            <div className="flex flex-col gap-0.5 mt-2 px-2">
                {links.map(link => {
                    const isActive = link.href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(link.href);

                    return (
                        <Link
                            key={link.href}
                            href={link.href}
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
        </nav>
    );
}
