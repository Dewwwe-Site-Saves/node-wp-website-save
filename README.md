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
```json
{
  "github": {
    "user": "username",
    "appPass": "password",
    "mail": "repository",
  },
  "sites": {
    "mysite.fr": {
            "repo": "name of git repo",
            "repoUrl": "HTTPS url of git repo (or SHH if you have the certificate setup on your computer)",
            "ftp": {
                "webRootPath": "wwww",
                "host": "ftp.mysite.com",
                "user": "ftp-user",
                "password": "ftp-password",
                "port": 21,
                "sftp": false
            }
        },
  }
}
```

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


## Initial Site Save setup
TBD


## Futur features
- [ ] Update README.md of backup with backup date
- [ ] Work with sftp (present but not working yet)
- [ ] Drupal support ?
- [x] Tag repos with date of backup for easy roll back
- [ ] Update backup file to display result on page 

