/**
 * Resets a user's password without the current one. The only way back in after a lost password, run by the operator inside the container:
 *
 *   npx tsx scripts/reset-password.ts <email> [new-password]
 *
 * Without a password argument a random one is generated and printed once. Change it from the Settings page afterwards.
 */
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../lib/auth';
import { findUserByEmail, setPasswordHash } from '../lib/db';
import { initDatabase, prisma } from '../lib/prisma';
import { emailSchema, passwordSchema } from '../lib/validation';

try {
    process.loadEnvFile('.env');
} catch {
    // .env is optional, variables may come from the environment
}

async function main(): Promise<void> {
    const [emailArg, passwordArg] = process.argv.slice(2);
    if (!emailArg) {
        console.error('Usage: npx tsx scripts/reset-password.ts <email> [new-password]');
        process.exit(1);
    }
    const email = emailSchema.parse(emailArg);
    const generated = passwordArg === undefined;
    const password = passwordSchema.parse(passwordArg ?? randomBytes(12).toString('base64url'));

    await initDatabase();
    const user = await findUserByEmail(email);
    if (!user) {
        console.error(`No user with email ${email}`);
        process.exit(1);
    }
    await setPasswordHash(user.id, await hashPassword(password));
    console.log(`Password updated for ${email}`);
    if (generated) console.log(`New password: ${password}`);
    await prisma.$disconnect();
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
