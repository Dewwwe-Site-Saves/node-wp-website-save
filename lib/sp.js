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
    constructor(filesFolder = __dirname, config) {

        console.log("Looking for SharePoint config...");

        if (config.sharepoint && config.sharepoint.tenantID) {
            console.log("Trying to setup SharePoint connection"); 

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
                    config: config,
                    scopes: [ 'https://'+config.sharepoint.tenantName+'.sharepoint.com/.default' ]
                }
            }));

            this.listName = config.sharepoint.listName;
            this.dateFieldName = config.sharepoint.dateFieldName;
        } else {
            console.log("No SharePoint config found.");
        }
    }

    async updateListItem(itemID) {

        if (this.listName) {

            this.list = this.sp.web.lists.getByTitle(this.listName);
    
            const date = new Date();
    
            i = await this.list.items.getById(itemID).update({
                [this.dateFieldName]: date.toISOString()
              });
              
            // console.log(i);

            console.log("List item ", itemID, " updated.");
        }
    }

}

export default Sp;

    // configure your node options (only once in your application)
    // const buffer = readFileSync("./lib/temp/key.pem");

    // const config = {
    //     auth: {
    //         authority: "https://login.microsoftonline.com/efdd91b6-5c0e-489a-8bfb-6bb556e462e6/",
    //         clientId: "eb05e560-5f25-4e3c-bff0-2c5650201ed2",
    //         clientCertificate: {
    //           thumbprint: "E97A386868CAA5EA21BDB3ADEC387DC8570BC925",
    //           privateKey: buffer.toString(),
    //         },
    //     },
    // };

    // const sp = spfi().using(SPDefault({
    //     baseUrl: 'https://dewwwe.sharepoint.com/sites/TestNode/',
    //     msal: {
    //         config: config,
    //         scopes: [ 'https://dewwwe.sharepoint.com/.default' ]
    //     }
    // }));

    // // make a call to SharePoint and log it in the console
    // // const w = await sp.web();
    // // console.log(JSON.stringify(w, null, 4));

    // const list = sp.web.lists.getByTitle("ListToEdit");

    // const i = await list.items.getById(1).update({
    //     Title: "My New Title",
    //     Description: "Here is a new description"
    //   });
      
    //   console.log(i);