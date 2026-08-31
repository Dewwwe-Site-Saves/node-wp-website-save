# Plan : Sécurisation et optimisation de node-wp-website-save

## Contexte

Outil Node.js de backup de sites WordPress utilisé pour 7 sites clients. Le script upload un fichier PHP sur le site pour dumper la DB, télécharge tous les fichiers via FTP/SFTP, commit/push sur GitHub, et met à jour une liste SharePoint. Actuellement orchestré par Jenkins.

**Architecture cible :**
App web unique (Express + React/Vite + SQLite) dans un seul container Docker sur le NAS Synology. UI pour configurer les sites, voir l'historique, déclencher les backups. Scheduler cron intégré. La liste SharePoint continue d'être mise à jour en parallèle.

---

## Phase 1 — Corrections de sécurité critiques — FAIT

### 1A. backup-wp.php sécurisé — FAIT
- Auth par token (`.dewwwe-backup-token` uploadé séparément via FTP)
- `escapeshellarg()` sur tous les paramètres mysqldump
- Nom du dump non devinable (contient le token)
- Vérifie succès du dump + fichier non vide
- Retourne du JSON propre
- Se supprime automatiquement après exécution

### 1B. index.js adapté — FAIT
- Génération de token crypto
- Parsing de la réponse JSON, vérification du succès
- Validation du dump téléchargé (taille + contenu SQL)
- Nettoyage du dump distant après download
- Fix maxBuffer sur git pull pour les gros repos
- Fix du fallback pull error → re-clone

### 1C. deleteFile() sur FTP et SFTP — FAIT

### 1D. Dépendances npm nettoyées — FAIT
- `basic-ftp` → 5.0.5 (fix path traversal)
- `axios` → 1.7.x (fix 16+ CVEs)
- Supprimé : `child_process`, `fs`, `npm`, `rimraf`, `mysqldump`
- 42 vulnérabilités → 3 modérées (toutes dans @azure/msal-node, non fixable sans breaking change PnP)

### 1E. Rotation des credentials — A FAIRE (action manuelle)
- Révoquer le GitHub PAT et en créer un nouveau (fine-grained)
- Changer les mots de passe FTP/SFTP des 7 sites
- Régénérer le certificat SharePoint
- Passer tous les repos en clone SSH

---

## Phase 2 — Performance et fiabilité

### 2A. Téléchargement incrémental — FAIT
- `lib/sync.js` : logique de comparaison partagée (taille + mtime)
- `downloadChanged()` sur FTP et SFTP : ne télécharge que les fichiers modifiés
- Suppression des fichiers locaux qui n'existent plus sur le distant
- `ensureGitFiles()` dans cleanup.js : version light pour le mode incrémental
- Mode par défaut = incrémental, `--full` pour forcer un download complet
- Impact attendu : de ~30 min à <2 min par site

### 2B. Validation du dump avant commit — FAIT
- Vérifie existence, taille (> 1 KB) et contenu SQL valide
- Bloque le commit si le dump est invalide

### 2C. Gestion d'erreurs et retry — A FAIRE
- `lib/utils.js` : `retry(fn, maxAttempts=3, delayMs=5000)` avec backoff exponentiel
- Try/catch autour de chaque étape majeure
- En cas d'échec, toujours tenter le nettoyage distant
- Exit code non-zéro en cas d'échec

### 2D. Exécution parallèle multi-sites — A FAIRE
- Extraire la logique par site dans `lib/backup.js` → `backupSite(domain, config)`
- `npm run save --all` ou `npm run save domain1 domain2`
- `Promise.allSettled()` avec concurrence limitée (défaut : 3)
- Rapport final succès/échec par site

### 2E. Support WP-CLI pour les sites SSH — A FAIRE
- `wp db export` via SSH au lieu du script PHP (plus fiable, pas de timeout)
- Config : champ `ssh: true` + `sshKey` par site
- Fallback automatique sur le script PHP si pas de SSH

---

## Phase 3 — App web (Express + React/Vite + SQLite)

### 3A. Structure du projet

```
wp-backup-manager/
├── server/
│   ├── index.js               # Entry point Express
│   ├── routes/
│   │   ├── sites.js           # CRUD sites
│   │   ├── backups.js         # Déclencher + historique backups
│   │   └── settings.js        # Config globale
│   ├── services/
│   │   ├── backup.js          # Logique de backup (refactorisée)
│   │   ├── ftp.js
│   │   ├── sftp.js
│   │   ├── ssh.js             # Client SSH pour WP-CLI
│   │   ├── git.js
│   │   ├── sharepoint.js
│   │   ├── scheduler.js       # node-cron
│   │   └── hackDetector.js    # Détection de piratage
│   ├── db/
│   │   ├── schema.sql
│   │   └── index.js           # Connexion better-sqlite3
│   └── helpers/
│       └── backup-wp.php
├── client/                    # Frontend React + Vite
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Sites.jsx
│   │   │   ├── SiteForm.jsx
│   │   │   ├── History.jsx
│   │   │   ├── Alerts.jsx     # Alertes piratage
│   │   │   └── Settings.jsx
│   │   ├── components/
│   │   │   ├── StatusBadge.jsx
│   │   │   ├── BackupLog.jsx
│   │   │   ├── AlertCard.jsx
│   │   │   └── Layout.jsx
│   │   └── App.jsx
│   └── vite.config.js
├── Dockerfile
├── docker-compose.yml
└── package.json
```

### 3B. Base de données SQLite

```sql
CREATE TABLE sites (
  id INTEGER PRIMARY KEY,
  domain TEXT UNIQUE NOT NULL,
  repo TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  protocol TEXT NOT NULL DEFAULT 'ftp',  -- 'ftp', 'sftp', 'ssh'
  host TEXT NOT NULL,
  port INTEGER DEFAULT 21,
  username TEXT NOT NULL,
  password TEXT,                          -- chiffré au repos
  web_root_path TEXT DEFAULT 'www',
  ssh_key_path TEXT,
  sp_list_item_id TEXT,
  cron_schedule TEXT DEFAULT '0 3 * * *',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE backups (
  id INTEGER PRIMARY KEY,
  site_id INTEGER REFERENCES sites(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'success', 'error', 'warning'
  duration_ms INTEGER,
  files_downloaded INTEGER,
  files_changed INTEGER,
  dump_size_bytes INTEGER,
  commit_sha TEXT,
  error_message TEXT,
  hack_alert INTEGER DEFAULT 0,          -- 1 si fichiers suspects détectés
  hack_details TEXT,                      -- JSON détails des fichiers suspects
  log TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,       -- 'backup_fail', 'hack_detected', 'backup_success'
  site_id INTEGER REFERENCES sites(id),
  backup_id INTEGER REFERENCES backups(id),
  sent_at TEXT,
  channel TEXT,             -- 'email', 'webhook'
  status TEXT DEFAULT 'pending'
);
```

### 3C. API REST

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/sites` | Liste tous les sites |
| POST | `/api/sites` | Ajouter un site |
| PUT | `/api/sites/:id` | Modifier un site |
| DELETE | `/api/sites/:id` | Supprimer un site |
| POST | `/api/sites/:id/test` | Tester la connexion FTP/SFTP |
| POST | `/api/backups/run/:id` | Lancer un backup pour un site |
| POST | `/api/backups/run-all` | Lancer tous les backups |
| GET | `/api/backups` | Historique (filtrable par site, statut) |
| GET | `/api/backups/:id/log` | Log détaillé d'un backup |
| POST | `/api/backups/:id/restore` | Restaurer un backup sur le site |
| GET | `/api/alerts` | Alertes piratage actives |
| PUT | `/api/alerts/:id/dismiss` | Marquer une alerte comme traitée |
| GET | `/api/settings` | Config globale |
| PUT | `/api/settings` | Modifier config globale |
| GET | `/api/dashboard` | Stats agrégées |

### 3D. Pages UI

1. **Dashboard** : cards par site avec statut du dernier backup (vert/rouge/orange/gris), date, durée. Alerte rouge si piratage détecté. Bouton "Tout sauvegarder".
2. **Sites** : tableau des sites configurés. Ajout/édition via formulaire. Boutons "Tester la connexion", "Lancer le backup".
3. **Historique** : tableau paginé avec filtre par site et statut. Clic pour voir le log. Badge d'alerte si fichiers suspects.
4. **Alertes** : liste des détections de piratage avec détails des fichiers suspects, diff, actions possibles.
5. **Settings** : config globale (GitHub, SharePoint, SMTP, chemins).

### 3E. Scheduler intégré

- `node-cron` pour planifier les backups par site
- Chaque site a son propre cron schedule (configurable via l'UI)
- Reconfiguration automatique quand la config change

### 3F. Docker

```dockerfile
FROM node:20-alpine AS frontend
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache git openssh-client
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --production
COPY server/ .
COPY --from=frontend /app/client/dist ./public
VOLUME ["/app/data", "/root/.ssh"]
EXPOSE 3000
CMD ["node", "index.js"]
```

```yaml
services:
  wp-backup:
    build: .
    container_name: wp-backup-manager
    restart: unless-stopped
    ports:
      - "8920:3000"
    volumes:
      - ./data:/app/data
      - ~/.ssh:/root/.ssh:ro
      - ./sp-certificates:/app/sp-certificates:ro
    environment:
      - NODE_ENV=production
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    networks:
      wp-backup-net:
        ipv4_address: 172.20.X.2

networks:
  wp-backup-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.X.0/29
```

---

## Phase 4 — Détection de piratage

### 4A. Analyse des fichiers modifiés après chaque backup

Après le download incrémental, le script connaît la liste des fichiers modifiés. On peut analyser ces changements pour détecter des signes de piratage.

**Service : `server/services/hackDetector.js`**

**Règles de détection :**

1. **Fichiers PHP suspects dans uploads/**
   - WordPress ne devrait jamais avoir de fichiers `.php` dans `wp-content/uploads/`
   - Alerte si un `.php` apparaît ou est modifié dans ce dossier
   
2. **Fichiers avec des noms suspects**
   - Noms aléatoires/encodés : `xk3j2.php`, `wp-tmp-2847.php`
   - Fichiers commençant par `.` dans des dossiers inhabituels : `.htaccess` modifié, `.user.ini` ajouté
   - Fichiers dans les dossiers core WP qui ne font pas partie d'une version connue

3. **Contenu suspect dans les fichiers modifiés**
   - `eval(`, `base64_decode(`, `gzinflate(`, `str_rot13(` — obfuscation classique
   - `$_GET[`, `$_POST[`, `$_REQUEST[` dans des fichiers qui ne devraient pas en contenir
   - `exec(`, `system(`, `passthru(`, `shell_exec(` — exécution de commandes
   - `file_get_contents('http` ou `curl_exec` dans des fichiers non-plugin
   - Chaînes encodées en base64 très longues (> 500 chars)

4. **Volume anormal de fichiers modifiés**
   - Si > 50 fichiers PHP sont modifiés en dehors d'une mise à jour WordPress connue → alerte
   - Comparer avec le nombre moyen de fichiers modifiés lors des backups précédents

5. **Fichiers core WordPress modifiés**
   - `wp-admin/`, `wp-includes/` ne devraient pas changer sauf lors d'une mise à jour WP
   - Comparer les checksums avec les versions officielles WordPress (API `wp-version-check`)

**Niveaux d'alerte :**
- **Critique** : fichier PHP dans uploads, code d'exécution de commandes dans un fichier core
- **Warning** : volume anormal de modifications, fichiers suspects dans les thèmes/plugins
- **Info** : modifications mineures détectées (pour review manuelle)

**Intégration dans le flow de backup :**
1. Après `downloadChanged()`, récupérer la liste des fichiers téléchargés (modifiés/nouveaux)
2. Passer cette liste au `hackDetector`
3. Si alerte détectée : marquer le backup comme `warning`, stocker les détails dans `hack_details`
4. Déclencher une notification (email/webhook)
5. Le backup continue normalement (on sauvegarde quand même, c'est justement le but d'avoir un historique)

### 4B. Checksums WordPress

- Au premier backup, stocker les checksums de tous les fichiers core WP
- API WordPress.org : `https://api.wordpress.org/core/checksums/1.0/?version=X.X.X` retourne les checksums officiels
- À chaque backup, comparer les fichiers core avec les checksums attendus
- Toute divergence = alerte

---

## Phase 5 — Notifications par email

### 5A. Configuration SMTP

**Dans Settings de l'UI :**
- Serveur SMTP (host, port, user, password)
- Adresse expéditeur
- Adresse(s) destinataire(s)
- Option : envoyer un email uniquement en cas d'erreur/alerte, ou aussi en cas de succès

**Stockage** : table `settings` (clés `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`, `smtp_from`, `notify_emails`, `notify_on_success`, `notify_on_failure`, `notify_on_hack`)

### 5B. Service de notification

**Service : `server/services/notifier.js`**

- Utilise `nodemailer` pour l'envoi SMTP
- Templates d'emails :
  - **Backup réussi** : site, date, durée, nombre de fichiers modifiés, lien vers le commit GitHub
  - **Backup échoué** : site, date, message d'erreur, log partiel
  - **Piratage détecté** : site, date, liste des fichiers suspects avec le niveau d'alerte, recommandations
- Envoi asynchrone (ne bloque pas le backup)
- Historique dans la table `notifications`
- Retry en cas d'échec d'envoi (3 tentatives)

### 5C. Digest quotidien (optionnel)

- Email récapitulatif quotidien : état de tous les sites, derniers backups, alertes en cours
- Envoyé le matin (configurable)
- Utile pour s'assurer que tout fonctionne sans vérifier l'UI

---

## Phase 6 — Restauration de backup

### 6A. Restauration des fichiers

**Flow de restauration :**
1. L'utilisateur sélectionne un backup dans l'historique (identifié par son commit SHA / tag git)
2. Le système checkout la version correspondante depuis le repo git
3. Upload de tous les fichiers vers le site via FTP/SFTP
4. Option : restaurer uniquement certains dossiers (`wp-content/themes/`, `wp-content/plugins/`, etc.)

**Précautions :**
- Confirmation explicite avant restauration
- Backup automatique de l'état actuel avant restauration (pour pouvoir annuler)
- Log détaillé de la restauration
- Ne pas écraser les fichiers de config (`wp-config.php`, `.htaccess`) sauf si explicitement demandé

### 6B. Restauration de la base de données

**Script PHP dédié : `helpers/restore-db.php`**

- Même système d'authentification par token que `backup-wp.php`
- Upload du fichier SQL dump via FTP/SFTP
- Le script PHP importe le dump dans la base
- Utilise `mysql` CLI ou PHP `mysqli` pour l'import
- Se supprime automatiquement après exécution
- Vérifications avant import : taille du dump, nom de la base correct

**Précautions :**
- Export automatique de la base actuelle avant import (point de restauration)
- Vérification que le dump correspond bien au site (nom de la base)
- Timeout élevé pour les grosses bases
- Option dry-run pour vérifier sans importer

### 6C. UI de restauration

**Page dans l'historique :**
- Bouton "Restaurer" sur chaque entrée de backup
- Modal de confirmation avec options :
  - Restaurer les fichiers uniquement
  - Restaurer la base de données uniquement
  - Restaurer tout
  - Exclure certains dossiers
- Barre de progression pendant la restauration
- Log en temps réel

---

## Ordre d'implémentation complet

```
Phase 1 (sécurité)                   ← FAIT
Phase 2A (incrémental)               ← FAIT
Phase 2B (validation dump)           ← FAIT
Phase 2C (error handling + retry)    ← A FAIRE
Phase 2D (parallel multi-sites)      ← A FAIRE
Phase 2E (WP-CLI pour sites SSH)     ← A FAIRE

Phase 3 (app web)                    ← A FAIRE
  3A. Structure projet
  3B. DB SQLite + migration config.json → DB
  3C. API REST
  3D. Frontend React/Vite
  3E. Scheduler node-cron
  3F. Docker + Compose

Phase 4 (détection piratage)         ← A FAIRE
  4A. Analyse des fichiers modifiés
  4B. Checksums WordPress

Phase 5 (notifications email)        ← A FAIRE
  5A. Config SMTP
  5B. Service notifier
  5C. Digest quotidien (optionnel)

Phase 6 (restauration)              ← A FAIRE
  6A. Restauration fichiers
  6B. Restauration DB
  6C. UI de restauration

Optionnel :
  - Remplacer Git par Restic pour le stockage
  - Webhooks Discord/Slack
```

## Vérification

- **Phase 1** : Testé sur dewwwe.com — token auth OK, script auto-supprimé, dump validé
- **Phase 2** : Tester le mode incrémental (temps, fichiers skipped). Vérifier qu'un dump vide bloque le commit
- **Phase 3** : Déployer sur le NAS, ajouter un site via l'UI, lancer un backup, vérifier l'historique
- **Phase 4** : Injecter un fichier PHP test dans uploads/ et vérifier la détection
- **Phase 5** : Envoyer un email de test depuis les settings
- **Phase 6** : Restaurer un backup de test sur un site non-critique
