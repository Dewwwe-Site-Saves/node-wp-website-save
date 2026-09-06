-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "notifyOnError" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Settings" ADD COLUMN "notifyTo" TEXT;
ALTER TABLE "Settings" ADD COLUMN "smtpHost" TEXT;
ALTER TABLE "Settings" ADD COLUMN "smtpPort" INTEGER NOT NULL DEFAULT 587;
ALTER TABLE "Settings" ADD COLUMN "smtpSecurity" TEXT NOT NULL DEFAULT 'starttls';
ALTER TABLE "Settings" ADD COLUMN "smtpUser" TEXT;
ALTER TABLE "Settings" ADD COLUMN "smtpPasswordEnc" TEXT;
ALTER TABLE "Settings" ADD COLUMN "smtpFrom" TEXT;
