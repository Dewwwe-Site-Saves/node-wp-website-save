/** Login and setup: no sidebar, one centered card. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
            <div className="w-full max-w-sm">
                <h1 className="text-center text-lg font-semibold mb-6">WP Backup Manager</h1>
                {children}
            </div>
        </div>
    );
}
