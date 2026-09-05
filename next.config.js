/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    // Safety net behind the turbopackIgnore comments in lib/paths.ts: the build-time tracer turns every `path.join(x, 'name')` into a `**/name` glob over the project, and nothing under the data directory may ever land in the standalone output (dumps, wp-config.php, certificates).
    outputFileTracingExcludes: { '*': ['./data/**', './files/**', './sp-certificates/**'] },
    // Native modules and the Prisma runtime must not be bundled by Next.js. ssh2 loads its own native binding (sshcrypto.node), which Turbopack cannot place in a chunk.
    serverExternalPackages: [
        'better-sqlite3',
        '@prisma/client',
        '@prisma/adapter-better-sqlite3',
        'ssh2',
        'ssh2-sftp-client',
    ],
};

export default nextConfig;
