import { NextResponse } from 'next/server';
import { apiHandler, jsonError, parseBody } from '@/lib/api';
import { getGithubToken, listSites } from '@/lib/db';
import { errorMessage } from '@/lib/engine/cancel';
import { GithubApiError, checkRepoAccess, checkToken, parseRepoUrl } from '@/lib/engine/github';
import { requireRole } from '@/lib/session';
import { githubTestSchema } from '@/lib/validation';

interface RepoCheck {
    domain: string;
    repo: string;
    ok: boolean;
    private: boolean | null;
    canPush: boolean | null;
    error: string | null;
}

/** Checks the token being typed (or the stored one) against `GET /user`, then the access to every site's repository. */
export const POST = apiHandler(async (request: Request) => {
    await requireRole('admin');
    const { data, response } = await parseBody(request, githubTestSchema);
    if (response) return response;

    const token = data.githubToken ?? (await getGithubToken());
    if (!token) return jsonError(400, 'No GitHub token to test');

    let login: string;
    try {
        login = await checkToken(token);
    } catch (error) {
        const message =
            error instanceof GithubApiError && error.status === 401
                ? 'GitHub rejected the token'
                : errorMessage(error);
        return NextResponse.json({ ok: false, login: null, repos: [], error: message });
    }

    const repos: RepoCheck[] = [];
    for (const site of await listSites()) {
        const ref = parseRepoUrl(site.repoUrl);
        const repo = `${ref.owner}/${ref.repo}`;
        try {
            const access = await checkRepoAccess(token, ref);
            repos.push({
                domain: site.domain,
                repo,
                ok: access.canPush,
                private: access.private,
                canPush: access.canPush,
                error: access.canPush ? null : 'Token has no push access to this repository',
            });
        } catch (error) {
            const message =
                error instanceof GithubApiError && error.status === 404
                    ? 'Repository not found or not granted to the token'
                    : errorMessage(error);
            repos.push({
                domain: site.domain,
                repo,
                ok: false,
                private: null,
                canPush: null,
                error: message,
            });
        }
    }

    return NextResponse.json({ ok: repos.every((r) => r.ok), login, repos, error: null });
});
