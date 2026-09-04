import { NextResponse } from 'next/server';
import { apiHandler, parseBody } from '@/lib/api';
import { getSettings, toSettingsView, updateSettings } from '@/lib/db';
import * as scheduler from '@/lib/jobs/scheduler';
import { requireRole } from '@/lib/session';
import { settingsSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async () => {
    return NextResponse.json(toSettingsView(await getSettings()));
});

/** Masked or empty secrets keep their stored value. */
export const PUT = apiHandler(async (request: Request) => {
    await requireRole('admin');
    const { data, response } = await parseBody(request, settingsSchema);
    if (response) return response;

    const settings = await updateSettings(data);
    // The default schedule may have changed.
    await scheduler.reload();
    return NextResponse.json(toSettingsView(settings));
});
