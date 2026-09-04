'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Account section of Settings: password change for the signed-in user. */
export function PasswordForm({ email }: { email: string }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSaved(false);
        if (newPassword !== passwordConfirmation) {
            setError('Passwords do not match');
            return;
        }
        setSaving(true);
        try {
            const res = await fetch('/api/auth/password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword, passwordConfirmation }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || 'Could not change the password');
                return;
            }
            setCurrentPassword('');
            setNewPassword('');
            setPasswordConfirmation('');
            setSaved(true);
        } catch {
            setError('Could not change the password');
        } finally {
            setSaving(false);
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Account</CardTitle>
                <CardDescription>
                    Signed in as {email}. Lost password: run{' '}
                    <code className="text-xs">npx tsx scripts/reset-password.ts {email}</code> on
                    the server.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                            {error}
                        </div>
                    )}
                    {saved && (
                        <div className="p-3 rounded-md bg-primary/10 border border-primary/20 text-sm">
                            Password changed.
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="currentPassword">Current password</Label>
                            <Input
                                id="currentPassword"
                                type="password"
                                autoComplete="current-password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">New password</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                autoComplete="new-password"
                                minLength={12}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newPasswordConfirmation">Confirm</Label>
                            <Input
                                id="newPasswordConfirmation"
                                type="password"
                                autoComplete="new-password"
                                minLength={12}
                                value={passwordConfirmation}
                                onChange={(e) => setPasswordConfirmation(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit" variant="outline" disabled={saving}>
                            {saving ? 'Changing...' : 'Change password'}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}
