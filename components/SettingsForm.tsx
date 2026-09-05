'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SettingsView } from '@/lib/db';
import { SECRET_MASK } from '@/lib/constants';

/** Every field as typed: the numbers stay strings until submit so a cleared input is not rewritten under the user's fingers. */
interface SettingsFormValues {
    githubName: string;
    githubEmail: string;
    githubToken: string;
    spTenantId: string;
    spClientId: string;
    spCertThumbprint: string;
    spTenantName: string;
    spSiteName: string;
    spListName: string;
    spDateField: string;
    defaultCron: string;
    concurrency: string;
    retentionDays: string;
}

/** The free-text fields, rendered by `field()`; the schedule and queue ones have their own inputs. */
type TextField = Exclude<keyof SettingsFormValues, 'defaultCron' | 'concurrency' | 'retentionDays'>;

interface GithubTestResult {
    ok: boolean;
    login: string | null;
    error: string | null;
    repos: {
        domain: string;
        repo: string;
        ok: boolean;
        private: boolean | null;
        error: string | null;
    }[];
}

function toFormValues(settings: SettingsView): SettingsFormValues {
    return {
        githubName: settings.githubName ?? '',
        githubEmail: settings.githubEmail ?? '',
        githubToken: settings.githubToken,
        spTenantId: settings.spTenantId ?? '',
        spClientId: settings.spClientId ?? '',
        spCertThumbprint: settings.spCertThumbprint ?? '',
        spTenantName: settings.spTenantName ?? '',
        spSiteName: settings.spSiteName ?? '',
        spListName: settings.spListName ?? '',
        spDateField: settings.spDateField ?? '',
        defaultCron: settings.defaultCron,
        concurrency: String(settings.concurrency),
        retentionDays: String(settings.retentionDays),
    };
}

export function SettingsForm({ settings }: { settings: SettingsView }) {
    const router = useRouter();
    const [form, setForm] = useState<SettingsFormValues>(toFormValues(settings));
    // Whether a token sits in the database: the field shows the mask and offers "Replace" only then.
    const [tokenStored, setTokenStored] = useState(settings.githubToken === SECRET_MASK);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [githubTest, setGithubTest] = useState<GithubTestResult | null>(null);

    function update<K extends keyof SettingsFormValues>(field: K, value: SettingsFormValues[K]) {
        setForm((prev) => ({ ...prev, [field]: value }));
        setSaved(false);
    }

    function field(id: TextField, label: string, placeholder?: string) {
        return (
            <div className="space-y-2">
                <Label htmlFor={id}>{label}</Label>
                <Input
                    id={id}
                    value={form[id]}
                    onChange={(e) => update(id, e.target.value)}
                    placeholder={placeholder}
                />
            </div>
        );
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...form,
                    concurrency: Number(form.concurrency),
                    retentionDays: Number(form.retentionDays),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(data.error || 'Could not save the settings');
                return;
            }
            setForm(toFormValues(data));
            setTokenStored(data.githubToken === SECRET_MASK);
            setSaved(true);
            router.refresh();
        } catch {
            setError('Could not save the settings');
        } finally {
            setSaving(false);
        }
    }

    async function handleTestGithub() {
        setTesting(true);
        setGithubTest(null);
        try {
            const res = await fetch('/api/settings/test-github', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ githubToken: form.githubToken }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setGithubTest({
                    ok: false,
                    login: null,
                    error: data.error || 'Test failed',
                    repos: [],
                });
                return;
            }
            setGithubTest(data);
        } catch {
            setGithubTest({ ok: false, login: null, error: 'Test failed', repos: [] });
        } finally {
            setTesting(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                    {error}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">GitHub</CardTitle>
                    <CardDescription>
                        Fine-grained personal access token with Contents read/write and Metadata
                        read on the backup repositories. Stored encrypted, used for pushes and
                        releases.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {field('githubName', 'Commit author name', 'Reposite')}
                        {field('githubEmail', 'Commit author email', 'backups@example.com')}
                    </div>
                    <SecretField
                        id="githubToken"
                        label="Token"
                        value={form.githubToken}
                        stored={tokenStored}
                        onChange={(value) => update('githubToken', value)}
                    />
                    <div className="flex items-center gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleTestGithub}
                            disabled={testing || (!form.githubToken && !tokenStored)}
                        >
                            {testing ? 'Testing...' : 'Test token'}
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            Checks the token above, or the stored one, against every site&apos;s
                            repository.
                        </span>
                    </div>
                    {githubTest && <GithubTestReport result={githubTest} />}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">SharePoint</CardTitle>
                    <CardDescription>
                        Optional. Updates a date field of a list item after each successful backup.
                        The certificate private key goes to{' '}
                        <code className="text-xs">$DATA_DIR/sp-certificates/key.pem</code>. Leave
                        everything empty to disable.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {field('spTenantId', 'Tenant ID')}
                    {field('spClientId', 'Application (client) ID')}
                    {field('spCertThumbprint', 'Certificate thumbprint')}
                    {field('spTenantName', 'Tenant name', 'contoso')}
                    {field('spSiteName', 'Site name')}
                    {field('spListName', 'List name')}
                    {field('spDateField', 'Date field (internal name)')}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Schedule & queue</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="defaultCron">Default schedule</Label>
                        <Input
                            id="defaultCron"
                            value={form.defaultCron}
                            onChange={(e) => update('defaultCron', e.target.value)}
                            className="font-mono"
                            required
                        />
                        <p className="text-xs text-muted-foreground">
                            Cron expression for sites without their own schedule.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="concurrency">Concurrent backups</Label>
                        <Input
                            id="concurrency"
                            type="number"
                            min={1}
                            max={5}
                            value={form.concurrency}
                            onChange={(e) => update('concurrency', e.target.value)}
                            required
                        />
                        <p className="text-xs text-muted-foreground">
                            Sites backed up at the same time (1 to 5).
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="retentionDays">History retention (days)</Label>
                        <Input
                            id="retentionDays"
                            type="number"
                            min={1}
                            max={3650}
                            value={form.retentionDays}
                            onChange={(e) => update('retentionDays', e.target.value)}
                            required
                        />
                        <p className="text-xs text-muted-foreground">
                            Older runs are pruned daily; the last 5 of each site are always kept.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <div className="flex items-center justify-end gap-3">
                {saved && <span className="text-sm text-muted-foreground">Saved</span>}
                <Button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save settings'}
                </Button>
            </div>
        </form>
    );
}

/** A stored secret is shown as a mask and left untouched unless "Replace" is clicked; the replacement is typed in clear. Stateless: the mask in `value` means "stored and untouched". */
function SecretField({
    id,
    label,
    value,
    stored,
    onChange,
}: {
    id: string;
    label: string;
    value: string;
    stored: boolean;
    onChange: (value: string) => void;
}) {
    const masked = stored && value === SECRET_MASK;

    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <div className="flex gap-2">
                <Input
                    id={id}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={masked ? '' : value}
                    placeholder={masked ? `${SECRET_MASK} (stored)` : 'github_pat_...'}
                    disabled={masked}
                    onChange={(e) => onChange(e.target.value)}
                    className="font-mono"
                />
                {stored && (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onChange(masked ? '' : SECRET_MASK)}
                    >
                        {masked ? 'Replace' : 'Keep stored'}
                    </Button>
                )}
            </div>
            {stored && !masked && (
                <p className="text-xs text-muted-foreground">
                    Leave empty to keep the stored token.
                </p>
            )}
        </div>
    );
}

function GithubTestReport({ result }: { result: GithubTestResult }) {
    const tone = result.ok
        ? 'bg-primary/10 border-primary/20'
        : 'bg-destructive/10 border-destructive/20 text-destructive';
    return (
        <div className={`p-3 rounded-md border text-sm space-y-2 ${tone}`}>
            <p>
                {result.login
                    ? `Token accepted, authenticated as ${result.login}.`
                    : (result.error ?? 'Token rejected.')}
            </p>
            {result.repos.length > 0 && (
                <ul className="space-y-1 text-xs">
                    {result.repos.map((repo) => (
                        <li key={repo.domain} className="flex flex-wrap gap-x-2">
                            <span className="font-mono" title={repo.domain}>
                                {repo.repo}
                            </span>
                            <span
                                className={repo.ok ? 'text-muted-foreground' : 'text-destructive'}
                            >
                                {repo.ok
                                    ? repo.private
                                        ? 'push access, private'
                                        : 'push access, PUBLIC repository'
                                    : repo.error}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {result.login && result.repos.length === 0 && (
                <p className="text-xs text-muted-foreground">No site configured yet.</p>
            )}
        </div>
    );
}
