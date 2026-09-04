import type { LogEntry, LogLevel, Logger } from './types';

export interface BufferedLogger extends Logger {
    readonly entries: readonly LogEntry[];
    /** One line per entry: `<time> [<level>] <message>`. */
    text(): string;
}

/**
 * Logger that keeps every entry in memory and forwards it to an optional listener (the
 * queue streams entries to SSE clients). Nothing is written to the console: the engine
 * is a library, the caller decides what to do with the output.
 */
export function createLogger(prefix: string, onLog?: (entry: LogEntry) => void): BufferedLogger {
    const entries: LogEntry[] = [];

    function write(level: LogLevel, msg: string): void {
        const entry: LogEntry = { time: new Date().toISOString(), level, msg: `${prefix} ${msg}` };
        entries.push(entry);
        onLog?.(entry);
    }

    return {
        entries,
        info: msg => write('info', msg),
        warn: msg => write('warn', msg),
        error: msg => write('error', msg),
        text: () => entries.map(e => `${e.time} [${e.level}] ${e.msg}`).join('\n'),
    };
}
