import type { TriggerType } from './types';

const API_BASE = 'https://api.github.com';
const TIMEOUT_MS = 30_000;

export interface RepoRef {
    owner: string;
    repo: string;
}

export class GithubApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'GithubApiError';
    }
}

/** Owner and repository name from a `https://github.com/<owner>/<repo>(.git)` URL. */
export function parseRepoUrl(repoUrl: string): RepoRef {
    const match =
        /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(repoUrl);
    if (!match) throw new Error(`Not a GitHub HTTPS repository URL: ${repoUrl}`);
    return { owner: match[1]!, repo: match[2]! };
}

async function request<T>(
    token: string,
    method: 'GET' | 'POST',
    route: string,
    body?: unknown,
): Promise<T> {
    const response = await fetch(`${API_BASE}${route}`, {
        method,
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'reposite',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
        const detail =
            isRecord(payload) && typeof payload.message === 'string' ? `: ${payload.message}` : '';
        throw new GithubApiError(
            response.status,
            `GitHub API ${response.status} on ${method} ${route}${detail}`,
        );
    }
    return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export interface ReleaseInput {
    name: string;
    body: string;
}

/** Creates a Release on an existing tag and returns its web URL. */
export async function createRelease(
    token: string,
    ref: RepoRef,
    tag: string,
    input: ReleaseInput,
): Promise<string> {
    const release = await request<{ html_url: string }>(
        token,
        'POST',
        `/repos/${ref.owner}/${ref.repo}/releases`,
        {
            tag_name: tag,
            name: input.name,
            body: input.body,
            draft: false,
            prerelease: false,
        },
    );
    return release.html_url;
}

/** Login of the user owning the token. Throws GithubApiError 401 on a bad token. */
export async function checkToken(token: string): Promise<string> {
    const user = await request<{ login: string }>(token, 'GET', '/user');
    return user.login;
}

export interface RepoAccess {
    private: boolean;
    /** Contents read/write granted on this repository. */
    canPush: boolean;
}

export async function checkRepoAccess(token: string, ref: RepoRef): Promise<RepoAccess> {
    const repo = await request<{ private: boolean; permissions?: { push?: boolean } }>(
        token,
        'GET',
        `/repos/${ref.owner}/${ref.repo}`,
    );
    return { private: repo.private, canPush: repo.permissions?.push === true };
}

export interface ReleaseStats {
    domain: string;
    date: Date;
    triggerType: TriggerType;
    filesDownloaded: number;
    filesUnchanged: number;
    filesDeleted: number;
    dumpSizeBytes: number;
    durationMs: number;
    commitSha: string;
}

/** Release notes: the run stats, so a snapshot can be judged from the Releases page alone. */
export function formatReleaseBody(stats: ReleaseStats): string {
    const seconds = Math.round(stats.durationMs / 1000);
    const duration = `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const dumpMb = (stats.dumpSizeBytes / (1024 * 1024)).toFixed(1);
    return [
        `Backup of **${stats.domain}** on ${stats.date.toISOString()} (${stats.triggerType}).`,
        '',
        '| | |',
        '|---|---|',
        `| Files downloaded | ${stats.filesDownloaded} |`,
        `| Files unchanged | ${stats.filesUnchanged} |`,
        `| Files deleted | ${stats.filesDeleted} |`,
        `| Database dump | ${dumpMb} MB |`,
        `| Duration | ${duration} |`,
        `| Commit | ${stats.commitSha} |`,
        '',
    ].join('\n');
}
