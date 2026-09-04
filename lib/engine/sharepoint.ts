import { SPDefault } from "@pnp/nodejs";
import "@pnp/sp/webs/index.js";
import "@pnp/sp/lists/index.js";
import "@pnp/sp/items/index.js";
import { readFileSync } from 'fs';
// import { Configuration } from "@azure/msal-node";
// import pkg from '@azure/msal-node';
// const { Configuration } = pkg; 
import { spfi } from "@pnp/sp";


class Sp {
    constructor(filesFolder = __dirname, config, logger = null) {
        this.log = logger || { log: console.log, error: console.error, warn: console.warn };

        this.log.log("Looking for SharePoint config...");

        if (config.sharepoint && config.sharepoint.tenantID) {
            this.log.log("Setting up SharePoint connection..."); 

            this.buffer = readFileSync("./sp-certificates/key.pem");

            this.config = {
                auth: {
                    authority: "https://login.microsoftonline.com/"+config.sharepoint.tenantID+"/",
                    clientId: config.sharepoint.applicationClientID,
                    clientCertificate: {
                      thumbprint: config.sharepoint.certificateThumbprint,
                      privateKey: this.buffer.toString(),
                    },
                },
            };
    
            this.sp = spfi().using(SPDefault({
                baseUrl: 'https://'+config.sharepoint.tenantName+'.sharepoint.com/sites/'+config.sharepoint.siteName+'/',
                msal: {
                    config: this.config,
                    scopes: [ 'https://'+config.sharepoint.tenantName+'.sharepoint.com/.default' ]
                }
            }));

            this.listName = config.sharepoint.listName;
            this.dateFieldName = config.sharepoint.dateFieldName;
        } else {
            this.log.log("No SharePoint config found.");
        }
    }

    async updateListItem(itemID) {

        if (this.listName) {

            this.list = this.sp.web.lists.getByTitle(this.listName);
    
            const date = new Date();
    
            await this.list.items.getById(itemID).update({
                [this.dateFieldName]: date.toISOString()
            });

            this.log.log("SharePoint list item " + itemID + " updated.");
        }
    }

}

export default Sp;