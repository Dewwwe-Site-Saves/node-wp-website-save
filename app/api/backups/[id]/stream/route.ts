import { getBackup } from '@/lib/db';
import { parseLog } from '@/lib/engine/logger';
import { subscribe } from '@/lib/jobs/queue';
import { isActive, parseId } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * SSE stream for one backup: `status` (current, then `running` when the worker claims the row), `log` lines (replay, then live), `done` with the final status. A finished backup gets its stored log replayed and `done` right away.
 */
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
    const id = parseId((await params).jobId);
    const backup = id ? await getBackup(id) : null;
    if (!backup) {
        return new Response('Backup not found', { status: 404 });
    }

    const backupId = backup.id;
    const domain = backup.site.domain;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            let closed = false;
            const send = (payload: Record<string, unknown>) => {
                if (!closed)
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
            };
            const close = () => {
                if (closed) return;
                closed = true;
                subscription.unsubscribe();
                try {
                    controller.close();
                } catch {
                    /* already closed by the client */
                }
            };
            const finish = (status: string) => {
                send({ type: 'done', status });
                close();
            };

            // Listeners and buffer come from the same tick: nothing emitted in between can be missed.
            const subscription = subscribe(backupId, {
                onLog: (entry) => send({ type: 'log', ...entry }),
                onStatus: (event) =>
                    send({
                        type: 'status',
                        status: event.status,
                        domain,
                        startedAt: event.startedAt,
                    }),
                onDone: finish,
            });
            request.signal.addEventListener('abort', close);

            send({
                type: 'status',
                status: backup.status,
                domain,
                queuedAt: backup.queuedAt,
                startedAt: backup.startedAt,
                triggerType: backup.triggerType,
                fullDownload: backup.fullDownload,
                skipGit: backup.skipGit,
            });
            for (const entry of subscription.lines) send({ type: 'log', ...entry });

            // The row read before the subscription may be stale. Every final status is written before `done` is emitted, so a fresh read settles it either way.
            const fresh = isActive(backup.status) ? await getBackup(backupId) : backup;
            if (closed) return;
            if (!fresh) {
                // The site was deleted while the backup ran; the row went with it.
                finish('error');
                return;
            }
            if (!isActive(fresh.status)) {
                if (subscription.lines.length === 0) {
                    for (const entry of parseLog(fresh.log ?? '')) send({ type: 'log', ...entry });
                }
                finish(fresh.status);
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        },
    });
}
