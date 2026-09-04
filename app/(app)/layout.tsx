import { redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getCurrentUser } from '@/lib/session';

/** Everything behind the login: the proxy checked the cookie, this reads the user behind it. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const user = await getCurrentUser();
    if (!user) redirect('/login');

    return <AppShell user={{ email: user.email, role: user.role }}>{children}</AppShell>;
}
