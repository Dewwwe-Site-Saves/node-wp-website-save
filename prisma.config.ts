import { defineConfig } from 'prisma/config';
import { dbUrl } from './lib/paths';

// The Prisma CLI does not load .env files: do it here so DATA_DIR is honoured by migrations.
try {
    process.loadEnvFile('.env');
} catch {
    // No .env file: DATA_DIR falls back to ./data
}

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: dbUrl(),
    },
});
