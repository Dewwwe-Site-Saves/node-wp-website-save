import fs from 'node:fs';
import { MSAL, SPDefault } from '@pnp/nodejs';
import { spfi } from '@pnp/sp';
import '@pnp/sp/webs/index.js';
import '@pnp/sp/lists/index.js';
import '@pnp/sp/items/index.js';
import type { Logger, SharePointConfig } from './types';

/**
 * Stamps the "last backup" date on the site's row in the SharePoint tracking list.
 * App-only authentication with the certificate under SP_CERT_DIR.
 */
export async function updateSharePointItem(
    config: SharePointConfig,
    itemId: string,
    log: Logger,
): Promise<void> {
    const id = Number(itemId);
    if (!Number.isInteger(id) || id <= 0) throw new Error(`Invalid SharePoint item id: ${itemId}`);

    const privateKey = fs.readFileSync(config.certPath, 'utf8');
    const siteUrl = `https://${config.tenantName}.sharepoint.com/sites/${config.siteName}/`;
    const sp = spfi(siteUrl).using(
        SPDefault(),
        MSAL(
            {
                auth: {
                    authority: `https://login.microsoftonline.com/${config.tenantId}/`,
                    clientId: config.clientId,
                    clientCertificate: { thumbprint: config.certThumbprint, privateKey },
                },
            },
            [`https://${config.tenantName}.sharepoint.com/.default`],
        ),
    );

    await sp.web.lists
        .getByTitle(config.listName)
        .items.getById(id)
        .update({ [config.dateField]: new Date().toISOString() });
    log.info(`SharePoint item ${id} updated`);
}
