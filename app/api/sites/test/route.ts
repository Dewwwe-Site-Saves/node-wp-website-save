import { NextResponse } from 'next/server';
import { apiHandler, jsonError, parseBody } from '@/lib/api';
import { runConnectionTest } from '@/lib/connection-test';
import { requireRole } from '@/lib/session';
import { connectionTestSchema } from '@/lib/validation';

/** Connection test for a site that does not exist yet: every field comes from the form. */
export const POST = apiHandler(async (request: Request) => {
    await requireRole('admin');
    const { data, response } = await parseBody(request, connectionTestSchema);
    if (response) return response;
    if (!data.password) return jsonError(400, 'password: Required');

    return NextResponse.json(await runConnectionTest({ ...data, password: data.password }));
});
