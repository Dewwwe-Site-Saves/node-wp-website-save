'use strict';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { backupSite, backupMultiple } from './lib/backup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load config
const config = JSON.parse(fs.readFileSync('config.json'));
config.localPath = __dirname;
config.filesPath = __dirname + '/files/';

// Parse arguments
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const fullDownload = process.argv.includes('--full');
const runAll = process.argv.includes('--all');
const skipGit = process.argv.includes('--no-git');

// Determine which sites to backup
let domains;
if (runAll) {
    domains = Object.keys(config.sites);
} else if (args.length > 0) {
    domains = args;
} else {
    domains = ['lbi-3d.fr'];
}

// Validate domains
for (const domain of domains) {
    if (!config.sites[domain]) {
        console.error(`No config found for domain: ${domain}`);
        console.error('Available sites: ' + Object.keys(config.sites).join(', '));
        process.exit(1);
    }
}

console.log(`\n=== Backup started — ${new Date().toLocaleString()} ===`);
console.log(`Sites: ${domains.join(', ')}${fullDownload ? ' (full download)' : ''}${skipGit ? ' (no git)' : ''}\n`);

const startTime = Date.now();
let results;

if (domains.length === 1) {
    // Single site: run directly with console output
    const result = await backupSite(domains[0], config, { basePath: __dirname, fullDownload, skipGit });
    results = [result];
} else {
    // Multiple sites: run in parallel (logs print in real-time with [domain] prefix)
    results = await backupMultiple(domains, config, { basePath: __dirname, fullDownload, skipGit, concurrency: 3 });
}

// Summary
const elapsed = Math.round((Date.now() - startTime) / 1000);
const mins = Math.floor(elapsed / 60);
const secs = elapsed % 60;

console.log('\n=== Summary ===');
for (const r of results) {
    const dur = Math.round(r.durationMs / 1000);
    const icon = r.status === 'success' ? 'OK' : 'FAIL';
    console.log(`  [${icon}] ${r.domain} — ${dur}s${r.commitSha ? ' (' + r.commitSha + ')' : ''}${r.error ? ' — ' + r.error : ''}`);
}
console.log(`\n=== Done — ${new Date().toLocaleString()} — ${mins}m ${secs}s total ===\n`);

const hasError = results.some(r => r.status === 'error');
process.exit(hasError ? 1 : 0);
