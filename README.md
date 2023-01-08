# node-wp-website-save

## Description 
This is a node.js module that allows you to backup a WordPress website to a github repository.
The database is save as SQL dump in webRoot folder. 

## Usage
```bash 
npm install
npm run save mysite.fr
```

## Config 
Config file must be provided for script to work. 
> See [config file example](./config-example.json)

### Setup SharePoint List update 
See [setup-sharepoint-updates](./setup-sharepoint-updates.md)

## Process 

 - Cleanup files (make sure /files/mysite/ exists)
 - Ensure the exitence of /files/ and /files/repo/.git if /files/repo/ exists
 - Git pull / clone
 - [ ] TODO: If error, delete the folder and clone again
 - Upload backup.php file
 - GET backup.php file (trigger database dump)
 - Empty folder (exept .git, readme.md and auto-tagged-release.yml)
 - Download files from ftp
 - Git commit & push & tag
 - Update SharePoint List

## Initial Site Save setup
TBD

## Debug
In case something fails, you need to delete the files folder corresponding to your site (/files/your-site).


## Future features
- [ ] Update README.md of backup with backup date
- [ ] Work with sftp (present but not working yet)
- [ ] Drupal support ?
- [x] Tag repos with date of backup for easy roll back
- [ ] Update backup file to display result on page 

