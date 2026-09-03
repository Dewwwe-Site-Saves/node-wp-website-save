-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" DATETIME
);

-- CreateTable
CREATE TABLE "Site" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "domain" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'ftp',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "webRootPath" TEXT NOT NULL DEFAULT 'www',
    "spListItemId" TEXT,
    "cronSchedule" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Backup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "siteId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "triggerType" TEXT NOT NULL DEFAULT 'manual',
    "fullDownload" BOOLEAN NOT NULL DEFAULT false,
    "skipGit" BOOLEAN NOT NULL DEFAULT false,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "durationMs" INTEGER,
    "filesDownloaded" INTEGER,
    "filesUnchanged" INTEGER,
    "filesDeleted" INTEGER,
    "dumpSizeBytes" INTEGER,
    "commitSha" TEXT,
    "tag" TEXT,
    "releaseUrl" TEXT,
    "errorMessage" TEXT,
    "log" TEXT,
    CONSTRAINT "Backup_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "githubEmail" TEXT,
    "githubTokenEnc" TEXT,
    "spTenantId" TEXT,
    "spClientId" TEXT,
    "spCertThumbprint" TEXT,
    "spTenantName" TEXT,
    "spSiteName" TEXT,
    "spListName" TEXT,
    "spDateField" TEXT,
    "defaultCron" TEXT NOT NULL DEFAULT '0 3 * * *',
    "concurrency" INTEGER NOT NULL DEFAULT 2,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Site_domain_key" ON "Site"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Site_repo_key" ON "Site"("repo");

-- CreateIndex
CREATE INDEX "Backup_siteId_queuedAt_idx" ON "Backup"("siteId", "queuedAt" DESC);

-- CreateIndex
CREATE INDEX "Backup_status_idx" ON "Backup"("status");
