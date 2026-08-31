/** @type {import('next').NextConfig} */
const nextConfig = {
    output: 'standalone',
    // better-sqlite3 is a native module, must not be bundled
    serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
