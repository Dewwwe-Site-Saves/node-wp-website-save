'use client';

import { useState } from 'react';
import { JobStatusProvider } from '@/components/JobStatusProvider';
import { Sidebar, type SidebarUser } from '@/components/Sidebar';

export function AppShell({ user, children }: { user: SidebarUser; children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <JobStatusProvider>
            {/* Viewport-high shell: the sidebar stays put, only the main area scrolls. */}
            <div className="flex h-dvh overflow-hidden">
                {/* Mobile header */}
                <div className="fixed top-0 left-0 right-0 z-40 md:hidden bg-slate-900 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-white">WP Backup Manager</h2>
                    <button
                        type="button"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                        className="text-slate-400 hover:text-white cursor-pointer"
                        aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
                    >
                        <svg
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            {sidebarOpen ? (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            ) : (
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4 6h16M4 12h16M4 18h16"
                                />
                            )}
                        </svg>
                    </button>
                </div>

                {/* Sidebar overlay on mobile */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 z-30 bg-black/50 md:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                <Sidebar user={user} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

                <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 md:p-8 bg-muted/30 pt-16 md:pt-8">
                    {children}
                </main>
            </div>
        </JobStatusProvider>
    );
}
