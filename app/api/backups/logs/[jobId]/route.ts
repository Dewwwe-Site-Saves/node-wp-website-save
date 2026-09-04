import { getBackup } from '@/lib/db';
import { events, getLogLines, type DoneEvent, type LogEvent } from '@/lib/jobs/queue';
import { ACTIVE_STATUSES, parseId, type BackupStatus } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
    const id = parseId((await params).jobId);
    const backup = id ? await getBackup(id) : null;
    if (!backup) {
        return new Response('Backup not found', { status: 404 });
    }

    const encoder = new TextEncoder();
    const backupId = backup.id;
    const status = backup.status as BackupStatus;

    const stream = new ReadableStream({
        start(controller) {
            const send = (payload: Record<string, unknown>) =>
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

            send({ type: 'status', status, domain: backup.site.domain });

            // Replay the lines buffered so far, then follow the run live.
            for (const entry of getLogLines(backupId) ?? []) {
                send({ type: 'log', ...entry });
            }

            if (!ACTIVE_STATUSES.includes(status)) {
                send({ type: 'done', status });
                controller.close();
                return;
            }

            function onLog(event: LogEvent) {
                if (event.backupId !== backupId) return;
                send({ type: 'log', ...event.entry });
            }

            function onDone(event: DoneEvent) {
                if (event.backupId !== backupId) return;
                send({ type: 'done', status: event.status });
                cleanup();
                controller.close();
            }

            let cleaned = false;
            function cleanup() {
                if (cleaned) return;
                cleaned = true;
                events.removeListener('log', onLog);
                events.removeListener('done', onDone);
            }

            events.on('log', onLog);
            events.on('done', onDone);

            request.signal.addEventListener('abort', () => {
                cleanup();
                try {
                    controller.close();
                } catch {
                    /* already closed */
                }
            });
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
