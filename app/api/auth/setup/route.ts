import { NextResponse } from 'next/server';
import { apiHandler, jsonError, parseBody } from '@/lib/api';
import { hashPassword } from '@/lib/auth';
import { countUsers, createUser, touchLastLogin } from '@/lib/db';
import { openSession } from '@/lib/session';
import { setupSchema } from '@/lib/validation';

/** Creates the first admin, then answers 403 for good. Public route: the proxy lets it through, the empty User table is the only credential. */

// Two first-run submissions at once must not create two admins: the count and the insert run one at a time.
let setupLock: Promise<unknown> = Promise.resolve();

export const POST = apiHandler(async (request: Request) => {
    if ((await countUsers()) > 0) return jsonError(403, 'Setup already completed');

    const { data, response } = await parseBody(request, setupSchema);
    if (response) return response;
    const passwordHash = await hashPassword(data.password);

    const insert = async () =>
        (await countUsers()) > 0 ? null : createUser(data.email, passwordHash, 'admin');
    const result = setupLock.then(insert, insert);
    setupLock = result.catch(() => undefined);
    const user = await result;
    if (!user) return jsonError(403, 'Setup already completed');

    await openSession(user);
    await touchLastLogin(user.id);
    return NextResponse.json(
        { user: { id: user.id, email: user.email, role: user.role } },
        { status: 201 },
    );
});
