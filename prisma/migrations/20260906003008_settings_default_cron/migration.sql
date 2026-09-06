-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "githubName" TEXT,
    "githubEmail" TEXT,
    "githubTokenEnc" TEXT,
    "spTenantId" TEXT,
    "spClientId" TEXT,
    "spCertThumbprint" TEXT,
    "spTenantName" TEXT,
    "spSiteName" TEXT,
    "spListName" TEXT,
    "spDateField" TEXT,
    "defaultCron" TEXT NOT NULL DEFAULT '0 2 1,15 * *',
    "concurrency" INTEGER NOT NULL DEFAULT 2,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("concurrency", "defaultCron", "githubEmail", "githubName", "githubTokenEnc", "id", "retentionDays", "spCertThumbprint", "spClientId", "spDateField", "spListName", "spSiteName", "spTenantId", "spTenantName", "updatedAt") SELECT "concurrency", "defaultCron", "githubEmail", "githubName", "githubTokenEnc", "id", "retentionDays", "spCertThumbprint", "spClientId", "spDateField", "spListName", "spSiteName", "spTenantId", "spTenantName", "updatedAt" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
