'use client';

import { Button } from '@/components/ui/button';

export function LogPanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pointer-events-none">
            <div className="w-full max-w-4xl pointer-events-auto">
                <div className="flex justify-end mb-2">
                    <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white"
                        onClick={onClose}>
                        Close
                    </Button>
                </div>
                {children}
            </div>
        </div>
    );
}
