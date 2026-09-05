import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackupCancelledError } from './cancel';
import { dumpDatabase } from './dump';
import { createLogger } from './logger';
import { FakeRemote } from './testing/fake-remote';
import type { SiteConfig } from './types';

const site: SiteConfig = {
    domain: 'site.test',
    repo: 'site',
    repoUrl: 'https://github.com/o/site.git',
    protocol: 'ftp',
    host: 'ftp.site.test',
    port: 21,
    username: 'u',
    password: 'p',
    webRootPath: 'www',
    spListItemId: null,
};

const SQL = `-- MySQL dump 10.13\nCREATE TABLE wp_options (id int);\n${'INSERT INTO wp_options VALUES (1);\n'.repeat(50)}`;

let workDir: string;
let remote: FakeRemote;
let localPath: string;
const log = createLogger('[test]');

/** Endpoint stub: checks the token header, creates the dump on the fake remote, answers like the PHP. */
function stubEndpoint(handler: (request: Request) => Response | Promise<Response>) {
    const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
        handler(new Request(input, init)),
    );
    vi.stubGlobal('fetch', fn);
    return fn;
}

function json(status: number, payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reposite-dump-'));
    localPath = path.join(workDir, 'db.sql');
    remote = new FakeRemote();
});

afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(workDir, { recursive: true, force: true });
});

describe('dumpDatabase', () => {
    it('uploads token hash and script, triggers, downloads, validates and cleans up', async () => {
        const fetchMock = stubEndpoint((request) => {
            expect(request.url).toBe('https://site.test/dewwwe-backup.php');
            expect(request.headers.get('X-Backup-Token')).toMatch(/^[0-9a-f]{64}$/);
            // The endpoint sees the token hash, never the token.
            const tokenFile = remote.files.get('/www/.dewwwe-backup-token');
            expect(tokenFile?.content.toString()).not.toBe(request.headers.get('X-Backup-Token'));
            expect(remote.files.get('/www/dewwwe-backup.php')?.content.toString()).toContain(
                '<?php',
            );
            remote.put('/www/db_wp_abcd1234.sql', SQL);
            return json(200, { status: 'ok', file: 'db_wp_abcd1234.sql', size: SQL.length });
        });

        const result = await dumpDatabase(site, remote.client(), localPath, log);
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(result.sizeBytes).toBe(SQL.length);
        expect(fs.readFileSync(localPath, 'utf8')).toBe(SQL);
        expect(remote.has('/www/db_wp_abcd1234.sql')).toBe(false);
        expect(remote.has('/www/dewwwe-backup.php')).toBe(false);
        expect(remote.has('/www/.dewwwe-backup-token')).toBe(false);
    });

    it('reports the endpoint error code and still removes script and token', async () => {
        stubEndpoint(() =>
            json(500, {
                status: 'error',
                code: 'exec_disabled',
                message: 'exec() is disabled on this host',
            }),
        );
        await expect(dumpDatabase(site, remote.client(), localPath, log)).rejects.toThrow(
            'Dump failed (HTTP 500): exec_disabled: exec() is disabled on this host',
        );
        expect(remote.has('/www/dewwwe-backup.php')).toBe(false);
        expect(remote.has('/www/.dewwwe-backup-token')).toBe(false);
    });

    it('truncates a non-JSON body', async () => {
        stubEndpoint(() => new Response(`<html>${'x'.repeat(2000)}`, { status: 403 }));
        await expect(dumpDatabase(site, remote.client(), localPath, log)).rejects.toSatisfy(
            (error: Error) => error.message.length < 700,
        );
    });

    it('refuses to follow a redirect', async () => {
        stubEndpoint(
            () =>
                new Response(null, {
                    status: 301,
                    headers: { Location: 'https://www.site.test/' },
                }),
        );
        await expect(dumpDatabase(site, remote.client(), localPath, log)).rejects.toThrow(
            'redirected to https://www.site.test/',
        );
    });

    it('rejects a dump that is not SQL and removes it from the remote', async () => {
        stubEndpoint(() => {
            remote.put('/www/db_wp_abcd1234.sql', `<br /><b>Warning</b>: ${'x'.repeat(2000)}`);
            return json(200, { status: 'ok', file: 'db_wp_abcd1234.sql' });
        });
        await expect(dumpDatabase(site, remote.client(), localPath, log)).rejects.toThrow(
            'does not look like SQL',
        );
        expect(remote.has('/www/db_wp_abcd1234.sql')).toBe(false);
    });

    it('rejects a too small dump', async () => {
        stubEndpoint(() => {
            remote.put('/www/db_wp_abcd1234.sql', 'CREATE TABLE t (id int);');
            return json(200, { status: 'ok', file: 'db_wp_abcd1234.sql' });
        });
        await expect(dumpDatabase(site, remote.client(), localPath, log)).rejects.toThrow(
            'too small',
        );
    });

    it('rejects an unexpected remote file name', async () => {
        stubEndpoint(() => json(200, { status: 'ok', file: '../wp-config.php' }));
        await expect(dumpDatabase(site, remote.client(), localPath, log)).rejects.toThrow(
            'unexpected file name',
        );
    });

    it('turns an abort during the request into a cancellation', async () => {
        const controller = new AbortController();
        stubEndpoint(async (request) => {
            controller.abort();
            await new Promise((resolve) => setTimeout(resolve, 5));
            request.signal.throwIfAborted();
            return json(200, {});
        });
        await expect(
            dumpDatabase(site, remote.client(), localPath, log, controller.signal),
        ).rejects.toBeInstanceOf(BackupCancelledError);
        expect(remote.has('/www/dewwwe-backup.php')).toBe(false);
    });
});
