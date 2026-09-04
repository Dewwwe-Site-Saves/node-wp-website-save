'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SetupForm() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        if (password !== passwordConfirmation) {
            setError('Passwords do not match');
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch('/api/auth/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, passwordConfirmation }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Setup failed');
                setSubmitting(false);
                return;
            }
            // Straight to Settings: the GitHub token is needed before the first backup.
            router.push('/settings');
            router.refresh();
        } catch {
            setError('Setup failed');
            setSubmitting(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Create the admin account</CardTitle>
                <CardDescription>
                    First run: this account manages every site and setting. Twelve characters
                    minimum for the password.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                            {error}
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            autoComplete="username"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoFocus
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            autoComplete="new-password"
                            minLength={12}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="passwordConfirmation">Confirm password</Label>
                        <Input
                            id="passwordConfirmation"
                            type="password"
                            autoComplete="new-password"
                            minLength={12}
                            value={passwordConfirmation}
                            onChange={(e) => setPasswordConfirmation(e.target.value)}
                            required
                        />
                    </div>
                    <Button type="submit" className="w-full" disabled={submitting}>
                        {submitting ? 'Creating...' : 'Create account'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
