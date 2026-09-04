import fs from 'fs';
import path from 'path';

// Files/folders to never delete locally (managed by git/cleanup)
const PRESERVED = new Set(['.git', '.gitignore', 'README.md', '.github']);

/**
 * Check if a relative path is safe (no directory traversal).
 */
export function isSafePath(relPath) {
    const normalized = path.normalize(relPath);
    return !normalized.startsWith('..') && !path.isAbsolute(normalized);
}

/**
 * Check if a remote file needs to be downloaded by comparing size and mtime.
 * Returns true if the file should be downloaded.
 */
export function shouldDownload(localPath, remoteSize, remoteMtime) {
    if (!fs.existsSync(localPath)) return true;

    const localStat = fs.statSync(localPath);

    // Different size → download
    if (localStat.size !== remoteSize) return true;

    // Remote is newer → download (with 2s tolerance for FTP mtime precision)
    if (remoteMtime && remoteMtime.getTime() - localStat.mtimeMs > 2000) return true;

    return false;
}

/**
 * Delete local files that no longer exist on the remote.
 * remoteFiles should be a Set of relative paths (e.g. "www/wp-config.php").
 */
export function deleteOrphans(localBasePath, remoteFiles) {
    let deleted = 0;

    function walkLocal(dir, relativeTo) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            // Skip preserved files at the root level
            const relPath = path.relative(relativeTo, path.join(dir, entry.name));
            const topLevel = relPath.split(path.sep)[0];
            if (PRESERVED.has(topLevel)) continue;

            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                walkLocal(fullPath, relativeTo);
                // Remove empty directories
                try {
                    const remaining = fs.readdirSync(fullPath);
                    if (remaining.length === 0) {
                        fs.rmdirSync(fullPath);
                        deleted++;
                    }
                } catch (e) { /* already removed */ }
            } else {
                if (!remoteFiles.has(relPath)) {
                    fs.unlinkSync(fullPath);
                    deleted++;
                }
            }
        }
    }

    walkLocal(localBasePath, localBasePath);
    return deleted;
}

export default { shouldDownload, deleteOrphans };
