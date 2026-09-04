import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SetupForm } from '@/components/SetupForm';
import { countUsers } from '@/lib/db';

export const metadata: Metadata = { title: 'Setup' };

/** First run only: once a user exists the page is gone for good. */
export default async function SetupPage() {
    if ((await countUsers()) > 0) redirect('/login');
    return <SetupForm />;
}
