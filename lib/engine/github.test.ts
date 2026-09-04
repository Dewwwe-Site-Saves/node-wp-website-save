import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkToken, createRelease, formatReleaseBody, parseRepoUrl } from './github';

function mockFetch(status: number, payload: unknown) {
    const fn = vi.fn(async () => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fn);
    return fn;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('parseRepoUrl', () => {
    it('extracts owner and repo, with or without .git', () => {
        expect(parseRepoUrl('https://github.com/Dewwwe-Site-Saves/dewwwe.git')).toEqual({ owner: 'Dewwwe-Site-Saves', repo: 'dewwwe' });
        expect(parseRepoUrl('https://github.com/owner/my.repo')).toEqual({ owner: 'owner', repo: 'my.repo' });
    });

    it('rejects anything else', () => {
        expect(() => parseRepoUrl('git@github.com:owner/repo.git')).toThrow();
        expect(() => parseRepoUrl('https://user:token@github.com/owner/repo.git')).toThrow();
    });
});

describe('createRelease', () => {
    it('posts to the releases endpoint with the token in the header and returns the URL', async () => {
        const fetchMock = mockFetch(201, { html_url: 'https://github.com/o/r/releases/tag/20260903-210509' });
        const url = await createRelease('tok', { owner: 'o', repo: 'r' }, '20260903-210509', { name: 'Backup', body: 'notes' });
        expect(url).toBe('https://github.com/o/r/releases/tag/20260903-210509');

        const [input, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(input).toBe('https://api.github.com/repos/o/r/releases');
        expect(init.method).toBe('POST');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
        expect(JSON.parse(init.body as string)).toMatchObject({ tag_name: '20260903-210509', name: 'Backup', body: 'notes' });
    });

    it('surfaces the API message on failure, never the token', async () => {
        mockFetch(422, { message: 'Validation Failed' });
        await expect(createRelease('tok', { owner: 'o', repo: 'r' }, 'v', { name: 'n', body: 'b' })).rejects.toMatchObject({
            name: 'GithubApiError',
            status: 422,
            message: 'GitHub API 422 on POST /repos/o/r/releases: Validation Failed',
        });
    });
});

describe('checkToken', () => {
    it('returns the login', async () => {
        mockFetch(200, { login: 'louis' });
        expect(await checkToken('tok')).toBe('louis');
    });

    it('fails on an invalid token', async () => {
        mockFetch(401, { message: 'Bad credentials' });
        await expect(checkToken('tok')).rejects.toMatchObject({ status: 401 });
    });
});

describe('formatReleaseBody', () => {
    it('renders the run stats', () => {
        const body = formatReleaseBody({
            domain: 'dewwwe.com',
            date: new Date('2026-09-03T21:05:09Z'),
            triggerType: 'scheduled',
            filesDownloaded: 12,
            filesUnchanged: 3400,
            filesDeleted: 2,
            dumpSizeBytes: 5 * 1024 * 1024,
            durationMs: 125_000,
            commitSha: 'abc1234',
        });
        expect(body).toContain('**dewwwe.com**');
        expect(body).toContain('(scheduled)');
        expect(body).toContain('| Files downloaded | 12 |');
        expect(body).toContain('| Database dump | 5.0 MB |');
        expect(body).toContain('| Duration | 2m 5s |');
        expect(body).toContain('| Commit | abc1234 |');
    });
});
