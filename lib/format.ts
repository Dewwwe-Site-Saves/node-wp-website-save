/** Display helpers shared by server and client components. */

export function formatDuration(ms: number): string {
    const secs = Math.round(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Labels for the run options, e.g. ["Full", "No git"]. */
export function optionLabels(fullDownload: boolean, skipGit: boolean, long = false): string[] {
    const labels: string[] = [];
    if (fullDownload) labels.push(long ? 'Full download' : 'Full');
    if (skipGit) labels.push('No git');
    return labels;
}
