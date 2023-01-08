# Setup SharePoint Updates 
This module can automatically update a date field in a SharePoint list with the current date from the save. 

## Creating App Registration 
1. Go to https://portal.azure.com 
2. Open Azure Active Directory / App Registrations 
3. Click "New Registration", give it a name & register 
4. Under "API Permissions" add an application permission SharePoint/Sites.ReadWrite.All
5. Generate a certificate from your terminal (cd in this project directory)
```bash
mkdir \sp-certificates
cd \sp-certificates
openssl req -x509 -newkey rsa:2048 -keyout keytmp.pem -out cert.pem -days 365 -passout pass:HereIsMySuperPass -subj '/C=FR/L=Lyon'
openssl rsa -in keytmp.pem -out key.pem -passin pass:HereIsMySuperPass
```
6. Upload "cert.pem" file to ADD App Registration under "Certificates & secrets"
7. Get Certificate Thumbprint from that page 

> Certificates Expire and you will have to regenerate it every year!! 

## For Config File 

Add the following entry to your config file: 
```json
"sharepoint": {
        "tenantID": "{Tenant ID}",
        "applicationClientID": "{Application (Client) ID}",
        "certificateThumbprint": "{Certificate Thumbprint (copy from AAD)}",
        "tenantName": "contoso",
        "siteName": "MySite",
        "listName": "MyList",
        "dateFieldName": "MyDateField"
    },
```
And for each site add the parameter: 
```json
"spListItemID": "1"
```

/!\ Make sure your certificates are present in the `sp-certificates` folder!


## Resources 
 - [PnP JS](https://pnp.github.io/pnpjs/)
 - [PnP JS Authentication](https://github.com/pnp/pnpjs/blob/version-3/docs/getting-started.md#authentication)
 - [PnP JS List Items](https://pnp.github.io/pnpjs/sp/items/#update-items)