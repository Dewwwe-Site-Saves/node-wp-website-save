import { backupQueue } from '@/lib/queue';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
    const { jobId } = await params;
    const id = parseInt(jobId);

    const job = backupQueue.getJob(id);
    if (!job) {
        return new Response('Job not found', { status: 404 });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            // Send current status
            controller.enqueue(
                encoder.encode(
                    `data: ${JSON.stringify({ type: 'status', status: job.status, domain: job.domain })}\n\n`,
                ),
            );

            // Replay all past log lines
            for (const entry of job.logLines) {
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'log', ...entry })}\n\n`),
                );
            }

            // If already done, close
            if (job.status === 'complete' || job.status === 'error' || job.status === 'cancelled') {
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({ type: 'done', status: job.status })}\n\n`,
                    ),
                );
                controller.close();
                return;
            }

            // Listen for new log events
            function onLog(event: any) {
                if (event.jobId !== id) return;
                controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: 'log', ...event })}\n\n`),
                );
            }

            function onDone(event: any) {
                if (event.jobId !== id) return;
                controller.enqueue(
                    encoder.encode(
                        `data: ${JSON.stringify({ type: 'done', status: event.status })}\n\n`,
                    ),
                );
                cleanup();
                controller.close();
            }

            let cleaned = false;
            function cleanup() {
                if (cleaned) return;
                cleaned = true;
                backupQueue.removeListener('log', onLog);
                backupQueue.removeListener('done', onDone);
            }

            backupQueue.on('log', onLog);
            backupQueue.on('done', onDone);

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
