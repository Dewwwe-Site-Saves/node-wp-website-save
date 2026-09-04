import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PasswordForm } from '@/components/PasswordForm';
import { SettingsForm } from '@/components/SettingsForm';
import { getSettings, toSettingsView } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
    const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
    if (!user) redirect('/login');

    return (
        <div className="max-w-3xl space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    GitHub, SharePoint, schedule and account
                </p>
            </div>
            <SettingsForm settings={toSettingsView(settings)} />
            <PasswordForm email={user.email} />
        </div>
    );
}
