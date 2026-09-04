import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: { default: 'WP Backup Manager', template: '%s · WP Backup Manager' },
    description: 'Self-hosted backup manager for WordPress sites',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <body className="min-h-screen bg-background antialiased">{children}</body>
        </html>
    );
}
