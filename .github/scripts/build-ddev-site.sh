#!/usr/bin/env bash
# Build the webmail this repository's suite runs against, in a DDEV project of type php served by Apache (Roundcube's
# public_html serves its scripts and styles through static.php/<path>, which Apache passes on as it is):
#   - the latest Roundcube from its releases (the complete package, with its PHP and JavaScript dependencies), or
#     ROUNDCUBE_VERSION, with public_html as the web root;
#   - its configuration for the project: the database of the container, the mail server beside it, the Elastic skin, the
#     time zone UTC and the messages sorted by date (so a list reads the same on every machine and every run), the
#     default folders made at the first login;
#   - its database made by its own bin/initdb.sh;
#   - a mail server of its own beside it: GreenMail (the IMAP and SMTP test server Roundcube's own CI runs its browser
#     tests against, Apache-2.0), with the two accounts of the suite;
#   - the test content (site/mail-site.php): the accounts' users with the names they show, their default folders and a
#     folder of their own, mails in their mailboxes, contacts and a group, a response, and the addresses they wrote to.
#
# Usage: SITE_DIR=/path/to/webmail .github/scripts/build-ddev-site.sh
#   SITE_DIR           where the DDEV project goes (required)
#   ROUNDCUBE_VERSION  a release of Roundcube (default: the latest of the 1.x line)
#   PHP_VERSION        the PHP of the web container (default: 8.3)
#   RESET_ONLY         1: build nothing; put the webmail back as the build left it (after a stopped run)
#   COUNTS_ONLY        1: build nothing; print the counts a test run must leave as it found them
#
# The accounts are configuration: GreenMail is given them here, cucumber.js names them; the features never create or
# delete one. GreenMail keeps its mailboxes in memory: after a restart of the project, RESET_ONLY=1 writes them again.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_NAME="${PROJECT_NAME:-roundcubesteps}"
PHP_VERSION="${PHP_VERSION:-8.3}"
SITE_DIR="${SITE_DIR:?SITE_DIR names the folder of the DDEV project}"
PASSWORD='dD.123123ddd'
GREENMAIL_IMAGE='greenmail/standalone:2.1.15'

# The webmail's own data, written and read with Roundcube's own classes (site/mail-site.php), in the web container.
mail_site() {
  cp "$REPO_DIR/site/mail-site.php" .webship-mail-site.php
  ddev exec php .webship-mail-site.php "$@" < /dev/null
  local status=$?
  rm -f .webship-mail-site.php
  return $status
}

if [ "${RESET_ONLY:-}" = "1" ] || [ "${COUNTS_ONLY:-}" = "1" ]; then
  cd "$SITE_DIR"
  if [ "${RESET_ONLY:-}" = "1" ]; then
    mail_site reset
    echo "The webmail is back as the build left it."
  else
    mail_site counts
  fi
  exit 0
fi

# The latest release of the 1.x line (GitHub's API, with the workflow's token when there is one, so a shared runner's
# address is not refused), else the release this pack was proven on.
if [ -z "${ROUNDCUBE_VERSION:-}" ]; then
  ROUNDCUBE_VERSION="$(curl -fsSL ${GITHUB_TOKEN:+-H "Authorization: Bearer ${GITHUB_TOKEN}"} 'https://api.github.com/repos/roundcube/roundcubemail/releases?per_page=20' 2>/dev/null \
    | python3 -c 'import json,sys; tags=[r["tag_name"] for r in json.load(sys.stdin) if not r["prerelease"] and r["tag_name"].startswith("1.")]; print(sorted(tags, key=lambda t: [int(x) for x in t.split(".") if x.isdigit()])[-1])' 2>/dev/null || true)"
  ROUNDCUBE_VERSION="${ROUNDCUBE_VERSION:-1.7.7}"
fi

mkdir -p "$SITE_DIR"
cd "$SITE_DIR"
ddev config --project-type=php --docroot=public_html --webserver-type=apache-fpm --php-version="$PHP_VERSION" --nodejs-version=24 --project-name="$PROJECT_NAME" --auto < /dev/null

# The mail server: the accounts of the suite, the login by the whole address, a wrong password refused.
cat > .ddev/docker-compose.greenmail.yaml <<YAML
# The mail server of the test webmail: GreenMail (Apache-2.0), the IMAP and SMTP test server Roundcube's own CI runs its
# browser tests against. Its accounts are configuration; a suite never makes one. IMAP greenmail:3143, SMTP greenmail:3025.
services:
  greenmail:
    container_name: ddev-\${DDEV_SITENAME}-greenmail
    image: ${GREENMAIL_IMAGE}
    restart: "no"
    labels:
      com.ddev.site-name: \${DDEV_SITENAME}
      com.ddev.approot: \${DDEV_APPROOT}
    environment:
      GREENMAIL_OPTS: "-Dgreenmail.setup.test.smtp -Dgreenmail.setup.test.imap -Dgreenmail.hostname=0.0.0.0 -Dgreenmail.users.login=email -Dgreenmail.users=alice:${PASSWORD}@example.com,bob:${PASSWORD}@example.com"
    expose:
      - "3025"
      - "3143"
YAML
ddev start -y < /dev/null
SITE_URL="https://${PROJECT_NAME}.ddev.site"

# Roundcube from its release: the complete package, unpacked into the project (public_html is its web root).
ddev exec "curl -fsSL https://github.com/roundcube/roundcubemail/releases/download/${ROUNDCUBE_VERSION}/roundcubemail-${ROUNDCUBE_VERSION}-complete.tar.gz -o /tmp/roundcube.tar.gz && tar -xzf /tmp/roundcube.tar.gz --strip-components=1 -C /var/www/html && rm -f /tmp/roundcube.tar.gz" < /dev/null

# Its configuration: the release's own sample (the plugins, the skin) with the values of this project.
KEY="$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
cat > config/config.inc.php <<PHP
<?php
// The configuration of the test webmail (written by .github/scripts/build-ddev-site.sh).
\$config = [];
\$config['db_dsnw'] = 'mysql://db:db@db/db';
\$config['imap_host'] = 'greenmail:3143';
\$config['smtp_host'] = 'greenmail:3025';
\$config['support_url'] = '';
\$config['des_key'] = '${KEY}';
\$config['plugins'] = ['archive', 'zipdownload'];
\$config['skin'] = 'elastic';
// A list reads the same on every machine: the time zone is the webmail's, not the browser's, and the messages are
// sorted by their date, the newest first (by default the webmail sorts them by their arrival in the folder, and a
// message a scenario moved back would arrive again).
\$config['timezone'] = 'UTC';
\$config['message_sort_col'] = 'date';
\$config['message_sort_order'] = 'DESC';
// The Drafts, Sent, Junk and Trash folders are there from the first login.
\$config['create_default_folders'] = true;
PHP

# The database, by Roundcube's own script.
ddev exec "bin/initdb.sh --dir=SQL" < /dev/null

# The accounts' users, their folders and the test content.
mail_site content

echo "Built the webmail at ${SITE_URL}: Roundcube ${ROUNDCUBE_VERSION}, PHP $(ddev exec php -r 'echo PHP_VERSION;' < /dev/null)"
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "LAUNCH_URL=${SITE_URL}" >> "$GITHUB_ENV"
fi
