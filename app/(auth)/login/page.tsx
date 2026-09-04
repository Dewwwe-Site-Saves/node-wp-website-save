import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { countUsers } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Sign in' };

/** Only ever a relative path on this host: the value comes from the URL. `//host` and `/\host` both resolve to another origin. */
function safeNext(value: string | undefined): string {
    return value && /^\/(?![/\\])/.test(value) ? value : '/';
}

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string }>;
}) {
    if ((await countUsers()) === 0) redirect('/setup');
    const next = safeNext((await searchParams).next);
    if (await getCurrentUser()) redirect(next);

    return <LoginForm next={next} />;
}
