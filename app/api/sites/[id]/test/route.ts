import { NextResponse } from 'next/server';
import { apiHandler, jsonError, parseBody } from '@/lib/api';
import { runConnectionTest } from '@/lib/connection-test';
import { getSiteConfig } from '@/lib/db';
import { requireRole } from '@/lib/session';
import { connectionTestSchema, parseId } from '@/lib/validation';

/** Connection test from the edit form: the fields being edited, with the stored password when the field is left empty. */
export const POST = apiHandler(
    async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
        await requireRole('admin');
        const id = parseId((await params).id);
        const site = id ? await getSiteConfig(id) : null;
        if (!site) return jsonError(404, 'Site not found');

        const { data, response } = await parseBody(request, connectionTestSchema);
        if (response) return response;

        let password = data.password;
        if (!password) {
            // The stored password only ever goes to the server it was stored for.
            const sameServer =
                data.protocol === site.protocol &&
                data.host === site.host &&
                data.port === site.port &&
                data.username === site.username;
            if (!sameServer) return jsonError(400, 'password: Required when the server changes');
            password = site.password;
        }

        return NextResponse.json(await runConnectionTest({ ...data, password }));
    },
);
