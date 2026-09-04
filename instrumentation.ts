/**
 * Next.js start-up hook. The file is also compiled for the edge runtime, hence the runtime guard and the dynamic import: better-sqlite3 and node-cron only exist under Node.
 */
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    const { boot } = await import('@/lib/jobs/boot');
    await boot();
}
