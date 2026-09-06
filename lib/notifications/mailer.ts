import nodemailer from 'nodemailer';
import type { SmtpSecurity } from '../constants';

/**
 * Outgoing mail over SMTP. Pure like the engine: the caller passes the decrypted configuration, nothing here reads the database or the environment. A transport is opened per send and closed right after, the app sends a handful of mails a month.
 */

export interface MailConfig {
    host: string;
    port: number;
    security: SmtpSecurity;
    /** Null for an open relay on the LAN. */
    user: string | null;
    password: string | null;
    from: string;
    to: string[];
}

export interface Mail {
    subject: string;
    text: string;
    html: string;
}

/** What the SMTP server said. "Accepted" only means the server queued the message: delivery is out of sight from here, and the response line (queue id, greylisting notice) is the lead to follow on the server side when nothing arrives. */
export interface SendResult {
    accepted: string[];
    rejected: string[];
    response: string;
}

/** Signature of `sendMail`, so the notifier and its tests can swap the real transport. */
export type MailSender = (config: MailConfig, mail: Mail) => Promise<SendResult>;

/** Connection and greeting timeouts: an unreachable host must not hold the notifier for minutes. */
const TIMEOUT_MS = 15_000;

/** Rejects when the server refuses the connection, the credentials or every recipient; resolves with the partial result when it refuses only some of them. */
export async function sendMail(config: MailConfig, mail: Mail): Promise<SendResult> {
    const transport = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.security === 'tls',
        requireTLS: config.security === 'starttls',
        ignoreTLS: config.security === 'none',
        auth: config.user ? { user: config.user, pass: config.password ?? '' } : undefined,
        connectionTimeout: TIMEOUT_MS,
        greetingTimeout: TIMEOUT_MS,
        socketTimeout: 2 * TIMEOUT_MS,
    });
    try {
        const info = await transport.sendMail({
            from: config.from,
            to: config.to,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
        });
        return {
            accepted: info.accepted.map(String),
            rejected: info.rejected.map(String),
            response: info.response ?? '',
        };
    } finally {
        transport.close();
    }
}
