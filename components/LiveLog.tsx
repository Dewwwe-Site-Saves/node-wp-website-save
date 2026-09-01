'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';

interface LogEntry {
    time: string;
    level: string;
    msg: string;
}

export function LiveLog({ jobId, domain }: { jobId: number; domain: string }) {
    const [lines, setLines] = useState<LogEntry[]>([]);
    const [status, setStatus] = useState<string>('connecting');
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Reset lines on (re)connect — server replays full history
        setLines([]);
        const source = new EventSource(`/api/backups/logs/${jobId}`);

        source.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'log') {
                setLines(prev => [...prev, { time: data.time, level: data.level, msg: data.msg }]);
            } else if (data.type === 'status') {
                setStatus(data.status);
            } else if (data.type === 'done') {
                setStatus(data.status === 'complete' ? 'success' : 'error');
                source.close();
            }
        };

        source.onerror = () => {
            source.close();
        };

        return () => source.close();
    }, [jobId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [lines]);

    const statusBadge = status === 'running'
        ? <Badge variant="outline" className="animate-pulse border-primary text-primary">RUNNING</Badge>
        : status === 'success'
        ? <Badge variant="default">COMPLETE</Badge>
        : status === 'error'
        ? <Badge variant="destructive">FAILED</Badge>
        : <Badge variant="outline">CONNECTING</Badge>;

    return (
        <div className="rounded-md border bg-slate-950 text-slate-300 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900">
                <span className="text-sm font-medium">{domain}</span>
                {statusBadge}
            </div>
            <div className="p-4 font-mono text-xs max-h-[500px] overflow-y-auto">
                {lines.length === 0 && status === 'connecting' && (
                    <span className="text-slate-500">Connecting...</span>
                )}
                {lines.map((line, i) => (
                    <div key={i} className={`py-0.5 ${
                        line.level === 'error' ? 'text-red-400'
                        : line.level === 'warn' ? 'text-yellow-400'
                        : 'text-slate-300'
                    }`}>
                        <span className="text-slate-600 mr-2">
                            {new Date(line.time).toLocaleTimeString()}
                        </span>
                        {line.msg}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
