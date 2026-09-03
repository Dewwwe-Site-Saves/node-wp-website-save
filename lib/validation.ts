import { z } from 'zod';
import { validate as validateCron } from 'node-cron';

// ============ Constants ============

export const PROTOCOLS = ['ftp', 'sftp'] as const;
export const BACKUP_STATUSES = ['pending', 'running', 'success', 'error', 'cancelled'] as const;
export const TRIGGER_TYPES = ['manual', 'scheduled'] as const;

export type BackupStatus = (typeof BACKUP_STATUSES)[number];
export type TriggerType = (typeof TRIGGER_TYPES)[number];

/** Statuses of a backup that is still in the queue or executing. */
export const ACTIVE_STATUSES: readonly BackupStatus[] = ['pending', 'running'];

// ============ Field schemas ============

// Hostname: labels of letters, digits and hyphens, at least one dot, no leading/trailing hyphen.
const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;
// Folder name used under FILES_DIR: no separators, no "." or "..".
const REPO_NAME = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;
// Only GitHub over HTTPS, no credentials in the URL.
const GITHUB_HTTPS_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?(\.git)?$/;

export const domainSchema = z.string().trim().toLowerCase().regex(HOSTNAME, 'Must be a valid hostname (e.g. mysite.com)');

export const repoNameSchema = z.string().trim().regex(REPO_NAME, 'Letters, digits, dots, dashes and underscores only');

export const repoUrlSchema = z
    .string()
    .trim()
    .regex(GITHUB_HTTPS_URL, 'Must be https://github.com/<owner>/<repo>.git')
    .transform(url => (url.endsWith('.git') ? url : `${url}.git`));

/** Path of the site under the FTP/SFTP root. Empty string means the root itself. */
export const webRootPathSchema = z
    .string()
    .trim()
    .transform(value => value.replace(/^\/+|\/+$/g, ''))
    .refine(value => !value.includes('\\') && !value.split('/').some(segment => segment === '..' || segment === '.'), 'Invalid path');

export const cronSchema = z.string().trim().refine(validateCron, 'Invalid cron expression');

export const emailSchema = z.email().trim().toLowerCase();

export const passwordSchema = z.string().min(12, 'At least 12 characters');

// ============ Sites ============

export const siteCreateSchema = z.object({
    domain: domainSchema,
    repo: repoNameSchema,
    repoUrl: repoUrlSchema,
    protocol: z.enum(PROTOCOLS),
    host: z.string().trim().min(1, 'Required'),
    port: z.number().int().min(1).max(65535),
    username: z.string().trim().min(1, 'Required'),
    password: z.string().min(1, 'Required'),
    webRootPath: webRootPathSchema.default('www'),
    spListItemId: z.string().trim().nullable().default(null).transform(value => value || null),
    cronSchedule: cronSchema.nullable().default(null),
    enabled: z.boolean().default(true),
});

/** Same as create, but an empty or missing password keeps the stored one. */
export const siteUpdateSchema = siteCreateSchema.extend({
    password: z.string().optional().transform(value => value || undefined),
});

export type SiteCreateInput = z.infer<typeof siteCreateSchema>;
export type SiteUpdateInput = z.infer<typeof siteUpdateSchema>;

// ============ Settings ============

const optionalText = z.string().trim().nullable().default(null).transform(value => value || null);

export const settingsSchema = z.object({
    githubEmail: emailSchema.nullable().default(null).or(z.literal('').transform(() => null)),
    /** Plain token to store, or undefined/masked value to keep the current one. */
    githubToken: z.string().trim().optional().transform(value => value || undefined),
    spTenantId: optionalText,
    spClientId: optionalText,
    spCertThumbprint: optionalText,
    spTenantName: optionalText,
    spSiteName: optionalText,
    spListName: optionalText,
    spDateField: optionalText,
    defaultCron: cronSchema,
    concurrency: z.number().int().min(1).max(5),
    retentionDays: z.number().int().min(1).max(3650),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

// ============ Backups ============

export const runBackupSchema = z.object({
    /** Omitted = every enabled site. */
    siteIds: z.array(z.number().int().positive()).optional(),
    fullDownload: z.boolean().default(false),
    skipGit: z.boolean().default(false),
});

export type RunBackupInput = z.infer<typeof runBackupSchema>;

export const backupsQuerySchema = z.object({
    siteId: z.coerce.number().int().positive().optional(),
    status: z.enum(BACKUP_STATUSES).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type BackupsQuery = z.infer<typeof backupsQuerySchema>;

// ============ Auth ============

export const setupSchema = z
    .object({
        email: emailSchema,
        password: passwordSchema,
        passwordConfirmation: z.string(),
    })
    .refine(data => data.password === data.passwordConfirmation, {
        message: 'Passwords do not match',
        path: ['passwordConfirmation'],
    });

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, 'Required'),
});

export const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, 'Required'),
        newPassword: passwordSchema,
        passwordConfirmation: z.string(),
    })
    .refine(data => data.newPassword === data.passwordConfirmation, {
        message: 'Passwords do not match',
        path: ['passwordConfirmation'],
    });

// ============ Helpers ============

/** Route id segment → positive integer, or null when malformed. */
export function parseId(value: string): number | null {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}
