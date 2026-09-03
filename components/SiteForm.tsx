'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SiteSummary } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const DEFAULT_CRON = '0 3 * * *';

interface SiteFormValues {
    domain: string;
    repo: string;
    repoUrl: string;
    protocol: 'ftp' | 'sftp';
    host: string;
    port: number;
    username: string;
    password: string;
    webRootPath: string;
    spListItemId: string;
    cronSchedule: string;
    enabled: boolean;
}

const defaults: SiteFormValues = {
    domain: '',
    repo: '',
    repoUrl: '',
    protocol: 'ftp',
    host: '',
    port: 21,
    username: '',
    password: '',
    webRootPath: 'www',
    spListItemId: '',
    cronSchedule: DEFAULT_CRON,
    enabled: true,
};

function toFormValues(site: SiteSummary): SiteFormValues {
    return {
        domain: site.domain,
        repo: site.repo,
        repoUrl: site.repoUrl,
        protocol: site.protocol === 'sftp' ? 'sftp' : 'ftp',
        host: site.host,
        port: site.port,
        username: site.username,
        password: '',
        webRootPath: site.webRootPath,
        spListItemId: site.spListItemId ?? '',
        cronSchedule: site.cronSchedule ?? DEFAULT_CRON,
        enabled: site.enabled,
    };
}

export function SiteForm({ site, mode = 'create' }: { site?: SiteSummary; mode?: 'create' | 'edit' }) {
    const router = useRouter();
    const [form, setForm] = useState<SiteFormValues>(site ? toFormValues(site) : defaults);
    const [useGlobalSchedule, setUseGlobalSchedule] = useState(!site?.cronSchedule);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    function update<K extends keyof SiteFormValues>(field: K, value: SiteFormValues[K]) {
        setForm(prev => {
            const updated = { ...prev, [field]: value };
            // Auto-switch port when protocol changes
            if (field === 'protocol') {
                updated.port = value === 'sftp' ? 22 : 21;
            }
            return updated;
        });
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setSaving(true);

        const payload = {
            ...form,
            spListItemId: form.spListItemId || null,
            cronSchedule: useGlobalSchedule ? null : form.cronSchedule,
        };

        try {
            const url = mode === 'create' ? '/api/sites' : `/api/sites/${site?.id}`;
            const method = mode === 'create' ? 'POST' : 'PUT';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'An error occurred');
                setSaving(false);
                return;
            }

            router.push(`/sites/${data.id}`);
            router.refresh();
        } catch {
            setError('Failed to save site');
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <div className="space-y-6">
                {error && (
                    <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                        {error}
                    </div>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Site information</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="domain">Domain</Label>
                            <Input id="domain" value={form.domain} onChange={e => update('domain', e.target.value)}
                                placeholder="mysite.com" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="repo">Repository name</Label>
                            <Input id="repo" value={form.repo} onChange={e => update('repo', e.target.value)}
                                placeholder="mysite" required />
                        </div>
                        <div className="col-span-2 space-y-2">
                            <Label htmlFor="repoUrl">Repository URL</Label>
                            <Input id="repoUrl" value={form.repoUrl} onChange={e => update('repoUrl', e.target.value)}
                                placeholder="https://github.com/org/repo.git" required />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Connection</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="protocol">Protocol</Label>
                            <select id="protocol" value={form.protocol} onChange={e => update('protocol', e.target.value === 'sftp' ? 'sftp' : 'ftp')}
                                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                                <option value="ftp">FTP</option>
                                <option value="sftp">SFTP</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="host">Host</Label>
                            <Input id="host" value={form.host} onChange={e => update('host', e.target.value)}
                                placeholder="ftp.mysite.com" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="port">Port</Label>
                            <Input id="port" type="number" min={1} max={65535} value={form.port}
                                onChange={e => update('port', parseInt(e.target.value) || 0)} required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="webRootPath">Web root path</Label>
                            <Input id="webRootPath" value={form.webRootPath} onChange={e => update('webRootPath', e.target.value)}
                                placeholder="www" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input id="username" value={form.username} onChange={e => update('username', e.target.value)}
                                required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" type="password" value={form.password}
                                onChange={e => update('password', e.target.value)}
                                placeholder={mode === 'edit' ? '(unchanged)' : ''}
                                required={mode === 'create'} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Schedule & Options</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <Label>Backup schedule</Label>
                                <p className="text-sm text-muted-foreground">Use the global schedule or set a custom one</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="global-schedule" className="text-sm">Global</Label>
                                <Switch id="global-schedule" checked={!useGlobalSchedule}
                                    onCheckedChange={(checked) => setUseGlobalSchedule(!checked)} />
                                <Label htmlFor="global-schedule" className="text-sm">Custom</Label>
                            </div>
                        </div>
                        {!useGlobalSchedule && (
                            <div className="space-y-2">
                                <Label htmlFor="cronSchedule">Cron expression</Label>
                                <Input id="cronSchedule" value={form.cronSchedule}
                                    onChange={e => update('cronSchedule', e.target.value)}
                                    placeholder={DEFAULT_CRON} className="font-mono" />
                                <p className="text-xs text-muted-foreground">Example: 0 3 * * * = daily at 3 AM, 0 */6 * * * = every 6 hours</p>
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-2">
                            <div>
                                <Label>SharePoint list item ID</Label>
                                <p className="text-sm text-muted-foreground">Optional — for SharePoint list update after backup</p>
                            </div>
                            <Input className="w-24" value={form.spListItemId}
                                onChange={e => update('spListItemId', e.target.value)}
                                placeholder="—" />
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <div>
                                <Label>Enabled</Label>
                                <p className="text-sm text-muted-foreground">Disabled sites are skipped during scheduled backups</p>
                            </div>
                            <Switch checked={form.enabled} onCheckedChange={(checked) => update('enabled', checked)} />
                        </div>
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
                    <Button type="submit" disabled={saving}>
                        {saving ? 'Saving...' : mode === 'create' ? 'Create Site' : 'Save Changes'}
                    </Button>
                </div>
            </div>
        </form>
    );
}
