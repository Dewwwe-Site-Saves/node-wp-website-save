import { NextResponse } from 'next/server';
import { apiHandler, jsonError, parseBody } from '@/lib/api';
import { getSettings, getSmtpPassword, toMailConfig } from '@/lib/db';
import { errorMessage } from '@/lib/engine/cancel';
import { appUrl } from '@/lib/env';
import { sendMail } from '@/lib/notifications/mailer';
import { testMail } from '@/lib/notifications/templates';
import { requireRole } from '@/lib/session';
import { smtpTestSchema } from '@/lib/validation';

/** Sends a test message with the SMTP block as typed (the stored password when the field is empty or masked). Returns what the server answered: accepted and rejected recipients plus its response line, since "accepted" only means queued and the response is the lead when nothing arrives. */
export const POST = apiHandler(async (request: Request) => {
    await requireRole('admin');
    const { data, response } = await parseBody(request, smtpTestSchema);
    if (response) return response;

    const { smtpPassword, ...fields } = data;
    const password = smtpPassword ?? (await getSmtpPassword(await getSettings()));
    const config = toMailConfig(fields, password);
    if (!config) return jsonError(400, 'Host, sender and at least one recipient are required');

    try {
        const result = await sendMail(config, testMail({ appUrl: appUrl() }));
        return NextResponse.json({ ok: result.rejected.length === 0, ...result, error: null });
    } catch (error) {
        return NextResponse.json({
            ok: false,
            accepted: [],
            rejected: config.to,
            response: null,
            error: errorMessage(error),
        });
    }
});
