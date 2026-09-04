import { NextResponse } from 'next/server';
import { apiHandler, jsonError, parseBody } from '@/lib/api';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { getPasswordHash, setPasswordHash } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { changePasswordSchema } from '@/lib/validation';

/** Password change for the current user; the current password is required. Recovery without it: `scripts/reset-password.ts`. */
export const PUT = apiHandler(async (request: Request) => {
    const user = await requireUser();
    const { data, response } = await parseBody(request, changePasswordSchema);
    if (response) return response;

    const hash = await getPasswordHash(user.id);
    if (!hash || !(await verifyPassword(data.currentPassword, hash))) {
        return jsonError(400, 'Current password is incorrect');
    }
    await setPasswordHash(user.id, await hashPassword(data.newPassword));
    return NextResponse.json({ success: true });
});
