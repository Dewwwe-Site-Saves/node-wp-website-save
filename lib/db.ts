import path from 'node:path';
import { Prisma } from './generated/prisma/client';
import type { Backup, Settings, Site } from './generated/prisma/client';
import { decrypt, encrypt } from './crypto';
import type { GithubConfig, Protocol, SharePointConfig, SiteConfig } from './engine/types';
import { spCertDir } from './paths';
import { prisma } from './prisma';
import type { BackupsQuery, SiteCreateInput, SiteUpdateInput } from './validation';

// ============ Sites ============

/** Every Site column except the encrypted password: the shape exposed to pages and the API. */
export const siteSelect = {
    id: true,
    domain: true,
    repo: true,
    repoUrl: true,
    protocol: true,
    host: true,
    port: true,
    username: true,
    webRootPath: true,
    spListItemId: true,
    cronSchedule: true,
    enabled: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.SiteSelect;

export type SiteSummary = Omit<Site, 'passwordEnc'>;

export function listSites(): Promise<SiteSummary[]> {
    return prisma.site.findMany({ select: siteSelect, orderBy: { domain: 'asc' } });
}

export function getSite(id: number): Promise<SiteSummary | null> {
    return prisma.site.findUnique({ where: { id }, select: siteSelect });
}

export function createSite(input: SiteCreateInput): Promise<SiteSummary> {
    const { password, ...data } = input;
    return prisma.site.create({
        data: { ...data, passwordEnc: encrypt(password) },
        select: siteSelect,
    });
}

/** An undefined password keeps the stored one. */
export function updateSite(id: number, input: SiteUpdateInput): Promise<SiteSummary> {
    const { password, ...data } = input;
    return prisma.site.update({
        where: { id },
        data: { ...data, ...(password ? { passwordEnc: encrypt(password) } : {}) },
        select: siteSelect,
    });
}

export async function deleteSite(id: number): Promise<void> {
    await prisma.site.delete({ where: { id } });
}

export type SiteWithLastBackup = SiteSummary & { lastBackup: Backup | null };

export async function listSitesWithLastBackup(): Promise<SiteWithLastBackup[]> {
    const sites = await prisma.site.findMany({
        select: { ...siteSelect, backups: { orderBy: { queuedAt: 'desc' }, take: 1 } },
        orderBy: { domain: 'asc' },
    });
    return sites.map(({ backups, ...site }) => ({ ...site, lastBackup: backups[0] ?? null }));
}

/** True when a Prisma error is a unique constraint violation (duplicate domain or repo). */
export function isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// ============ Backups ============

export type BackupWithDomain = Backup & { site: { domain: string } };

export interface BackupPage {
    items: BackupWithDomain[];
    total: number;
    page: number;
    pageSize: number;
}

export async function listBackups(query: BackupsQuery): Promise<BackupPage> {
    const where: Prisma.BackupWhereInput = {
        ...(query.siteId ? { siteId: query.siteId } : {}),
        ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await prisma.$transaction([
        prisma.backup.findMany({
            where,
            include: { site: { select: { domain: true } } },
            orderBy: { queuedAt: 'desc' },
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
        }),
        prisma.backup.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
}

export function getBackup(id: number): Promise<BackupWithDomain | null> {
    return prisma.backup.findUnique({
        where: { id },
        include: { site: { select: { domain: true } } },
    });
}

// ============ Settings ============

/** The singleton row, created with defaults on first access. */
export function getSettings(): Promise<Settings> {
    return prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

// ============ Engine configs (decrypted) ============

export async function getSiteConfig(id: number): Promise<SiteConfig | null> {
    const site = await prisma.site.findUnique({ where: { id } });
    if (!site) return null;
    return {
        domain: site.domain,
        repo: site.repo,
        repoUrl: site.repoUrl,
        protocol: site.protocol as Protocol,
        host: site.host,
        port: site.port,
        username: site.username,
        password: decrypt(site.passwordEnc),
        webRootPath: site.webRootPath,
        spListItemId: site.spListItemId,
    };
}

/** Null until both the token and the commit email are configured. */
export async function getGithubConfig(): Promise<GithubConfig | null> {
    const settings = await getSettings();
    if (!settings.githubTokenEnc || !settings.githubEmail) return null;
    return { email: settings.githubEmail, token: decrypt(settings.githubTokenEnc) };
}

/** Null unless every SharePoint field is filled in. */
export async function getSharePointConfig(): Promise<SharePointConfig | null> {
    const s = await getSettings();
    if (
        !s.spTenantId ||
        !s.spClientId ||
        !s.spCertThumbprint ||
        !s.spTenantName ||
        !s.spSiteName ||
        !s.spListName ||
        !s.spDateField
    ) {
        return null;
    }
    return {
        tenantId: s.spTenantId,
        clientId: s.spClientId,
        certThumbprint: s.spCertThumbprint,
        tenantName: s.spTenantName,
        siteName: s.spSiteName,
        listName: s.spListName,
        dateField: s.spDateField,
        certPath: path.join(spCertDir(), 'key.pem'),
    };
}
