/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    // Native modules and the Prisma runtime must not be bundled by Next.js
    serverExternalPackages: ['better-sqlite3', '@prisma/client', '@prisma/adapter-better-sqlite3'],
};

export default nextConfig;
