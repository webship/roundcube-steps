<p align="center"><img src="https://raw.githubusercontent.com/webship/roundcube-steps/2.0.x/assets/logo.svg" alt="Roundcube logo" width="96"></p>

# roundcube-steps

[![Test](https://github.com/webship/roundcube-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/roundcube-steps/actions/workflows/test.yml)

Cucumber step definitions for testing webmail built with Roundcube, with
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation harness built on Playwright and
Cucumber-js.

`@webship-js/roundcube-steps` covers the session, the mail, writing mail, the settings and the address book:

- **the session**: the login by an account of the users registry (and a wrong password refused), the account the
  webmail shows, the logout, and what the webmail says;
- **the mail**: the folders and their unread counts, the message list (its messages, their order, read or unread,
  flagged or not), a message opened (its sender, its recipients, its subject, its text, its attachments), marking,
  deleting to the trash, moving to a folder, and the search;
- **writing mail**: a new message, a reply, a reply to all and a forward, the recipients (To, Cc, Bcc), the subject and
  the text, a response inserted, the message sent, saved as a draft or discarded;
- **the settings**: folders made, renamed and deleted, identities added and deleted, responses added and deleted, and
  the preferences of a section;
- **the address book**: its contacts (added, opened, deleted) and its groups (made, given a contact, deleted).

No step phrase names the platform: a scenario reads `When I send the message` and `Then the message list should show
"Webship weekly report"`.

CI builds a real webmail with [DDEV](https://ddev.com) on the runner: the latest Roundcube from its releases, its
database made by its own `bin/initdb.sh`, a mail server of its own beside it (GreenMail, the IMAP and SMTP test server
Roundcube's own CI runs its browser tests against) with the accounts of the suite, and the test content. It does this
on PHP 8.3 and on PHP 8.1, and on every push and pull request it runs the whole suite twice, comparing what the
webmail holds before and after each run, then the assertions that must fail. See [The test webmail](#the-test-webmail)
and [`.github/workflows/test.yml`](.github/workflows/test.yml).

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, python3, and Node.js 24 or later with npm. PHP, the
database and the mail server run in DDEV's containers.

**1. The webmail.** The pack's own build script (the one CI runs) makes the webmail in a DDEV project of type `php`
served by Apache. It installs the latest Roundcube with its database made by its own `bin/initdb.sh`, a mail server
beside it with the two accounts of [Test users](#test-users), and the test content (see
[The test webmail](#the-test-webmail)). It takes about a minute.

```bash
git clone https://github.com/webship/roundcube-steps.git
SITE_DIR="$PWD/roundcube-webmail" roundcube-steps/.github/scripts/build-ddev-site.sh
```

The webmail answers at `https://roundcubesteps.ddev.site/`. The accounts are `alice@example.com` and
`bob@example.com`, each with the password `dD.123123ddd` (step 3 names them).

In the [Webship Workspace](https://github.com/webship/workspace), its Roundcube plugin builds the same webmail instead,
in a sites folder of the workspace: `dev/` here, the one `--with-needs` adds to a new workspace; `test/`, `sandboxes/`
and `demos/` work the same.

```bash
bash core/scripts/plugins.sh --require roundcube --with-needs
bash core/scripts/plugins.sh --activate roundcube --with-needs
bash core/scripts/plugins.sh --install roundcube
bash dev/cmd-roundcube-project.sh rcmail --install --add-users --sample-data
```

That webmail answers at `https://rcmail.ddev.site/`, with the same two accounts and the same test content; its address
goes in `LAUNCH_URL` (step 5).

**2. A test project.**

```bash
mkdir roundcube-tests && cd roundcube-tests
npm init -y
npm install --save-dev webship-js @webship-js/roundcube-steps
npx init-webship-js
```

`npx init-webship-js` writes `cucumber.js`, `playwright.config.ts`, the `tests/` folders with a first feature and the
`npm test` scripts, and installs Chromium. npm usually runs it already when it installs webship-js; a second run changes
nothing.

**3. `cucumber.js`.** Replace the file with the wiring of the pack:

- the step files of webship-js and of the pack;
- the tags that keep the assertions that must fail out of a normal run;
- the address of the webmail, and the names of its trash, sent and drafts folders;
- the accounts (the JSON of [Test users](#test-users)).

The first lines are the starter's own: a feature named on the command line runs alone.

```javascript
// A feature file or a scenario (file:line) named on the command line runs alone:
// cucumber-js 12 would add it to the paths below, so `paths` is left empty then.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  if (!/cucumber(-js|\.js)?$/.test(String(process.argv[1] || ''))) return [];
  const args = process.argv.slice(2);
  const paths = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('-')) {
      if (OPTIONS_WITH_A_VALUE.has(args[i])) i += 1;
    } else {
      paths.push(args[i]);
    }
  }
  return paths;
}

const launchUrl = (process.env.LAUNCH_URL || 'https://roundcubesteps.ddev.site').replace(/\/+$/, '');

module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',
      'node_modules/@webship-js/roundcube-steps/tests/step-definitions/**/*.js',
      'tests/step-definitions/**/*.js',
    ],
    paths: commandLinePaths().length ? [] : ['tests/features/**/*.feature'],
    // Work in progress and the assertions that must fail stay out of a normal run.
    tags: process.env.CUCUMBER_TAGS || 'not @wip and not @must-fail',
    format: ['@cucumber/pretty-formatter', 'json:tests/reports/cucumber_report.json'],
    worldParameters: {
      launchUrl,
      // The webmail's folders by their role: a message deleted for good goes through the trash.
      mail: { trash: 'Trash', sent: 'Sent', drafts: 'Drafts' },
      // The waits webship-js adds around each page, scenario and step (milliseconds).
      minWaitTime: { page: 3000, before_scenario: 0, after_scenario: 0, before_step: 0, after_step: 0 },
      // Each account logs in with its address.
      users: {
        alice: { username: 'alice@example.com', password: 'dD.123123ddd', email: 'alice@example.com', name: 'Alice Test' },
        bob: { username: 'bob@example.com', password: 'dD.123123ddd', email: 'bob@example.com', name: 'Bob Test' },
      },
    },
  },
};
```

**4. A first feature**, `tests/features/first-run.feature`:

```gherkin
Feature: First run
  Scenario: Alice reads a message of her inbox
    Given I am logged in to the webmail as "alice"
    Then the folder "Inbox" should show 2 unread
    When I open the message "The test plan, attached"
    Then the message should be from "Bob Test"
    And the message should list the attachment "test-plan.txt"

  Scenario: Alice's address book
    Given I am logged in to the webmail as "alice"
    Then the contact list should show "Bob Test"
```

**5. Run it.** Set `LAUNCH_URL` to the address of the webmail: `https://roundcubesteps.ddev.site` for the build
script's webmail, `https://rcmail.ddev.site` for the Workspace's.

```bash
LAUNCH_URL=https://roundcubesteps.ddev.site npm test
```

A green first run prints every step, then the summary (the starter feature of `npx init-webship-js` and the two
scenarios above, passed); the HTML report is in `tests/reports/`:

```
3 scenarios (3 passed)
9 steps (9 passed)
```

The message opened in the first scenario is marked read by the webmail, and set back to unread when the scenario
ends: a second run reads the same counts.

From there, copy the features of [`tests/features/`](tests/features/). They also ship in the package, under
`node_modules/@webship-js/roundcube-steps/tests/features/`, and together they use every step of the pack. They read no
file of their own, so they run on the build script's webmail and on the Workspace's as they are.

### What the suite tests

The features of this repository run every step of the pack against the test webmail, twice in a row in CI on every
change, then the assertions that must fail:

- **`session.feature`**: a wrong password refused, the login of an account, the account the webmail shows, the
  logout.
- **`mail.feature`**: the inbox's unread count and its messages, the newest first, read or not and flagged or not; a
  message with an attachment opened (its sender, its recipient, its subject, its text, its attachment, and the unread
  count after it); messages marked; a message deleted to the trash; a message moved to a folder of its own; the
  search; the sent folder.
- **`compose.feature`**: Alice writes to Bob with a copy to herself, sends it, finds it in her sent folder, and Bob
  finds it unread in his inbox; a reply filled in (its subject, its recipient, the quoted text), a response inserted,
  and the reply left; a reply to all and a forward filled in; a draft kept.
- **`folders.feature`**: a folder made, a folder made inside it and deleted, and a folder renamed.
- **`settings.feature`**: an identity added and deleted, a response added and deleted, and two preferences of a
  section set.
- **`contacts.feature`**: the contacts, a contact opened, the group and its members; a contact added and deleted; a
  group made, given a contact, and deleted.

Every scenario puts back what it changes when it ends, through the account's own session of the webmail (so it works
whatever the scenario's browser did):

- the read and flagged marks of a folder's messages, as they were when a step first touched the folder (opening a
  message marks it read, and so does the webmail's "display next" after a delete or a move);
- a message deleted or moved comes back to its folder;
- a message sent goes for good: its copy in the sender's sent folder, the copy each account of the users registry got
  in its inbox, and the addresses the sending collected; a draft goes the same way;
- a folder made is deleted, a folder renamed gets its name back;
- an identity, a response, a contact or a group made is deleted, a contact put in a group leaves it, and a section of
  the preferences is saved again as it was.

The suite leaves the webmail as it found it, and CI checks this with the webmail's counts.

Not tested:

- attachments uploaded to a message, the HTML editor, printing, a message's source and its export or import;
- the plugins' own screens (the archive folder, the download of several messages as a zip);
- importing and exporting contacts, and the trusted senders;
- spelling, encryption, and the server settings (filters and the like belong to the mail server);
- languages other than English (the steps read the webmail's words: "Message sent successfully.", "Add group").

## Requirements

- Node.js 24 or later
- A webship-js 2.0 test project (webship-js 2.0.16 or later)
- A webmail on Roundcube 1.7 (proven on 1.7.7) with its Elastic skin (the default), and accounts on its mail server for
  the suite

## Install

```bash
npm install --save-dev @webship-js/roundcube-steps
```

List the pack's step files in `cucumber.js` after webship-js's.

## What is included

| File | Covers |
| --- | --- |
| `roundcube-session.steps.js` | The login by an account of the users registry or by an address and a password, a login refused, the account the webmail shows, the logout, what the webmail says. |
| `roundcube-mail.steps.js` | The folders and their unread counts, the message list (its messages, their order, their marks), a message opened (its sender, recipients, subject, text and attachments), marking, deleting, moving, the search. |
| `roundcube-compose.steps.js` | A new message, a reply, a reply to all and a forward, the recipients, the subject and the text, a response inserted, the message sent, saved as a draft or discarded. |
| `roundcube-settings.steps.js` | The folders (made, renamed, deleted, listed), the identities, the responses, and the preferences of a section. |
| `roundcube-contacts.steps.js` | The contacts of "Personal Addresses" (added, listed, opened, deleted) and its groups (made, listed, given a contact, deleted). |
| `roundcube-defaults.js` | The hooks: the restores a scenario asked for, run when it ends, and the accounts' sessions closed when the run ends. It registers no step. |
| `roundcube-helpers.js` | Shared plumbing: the webmail's addresses, the waits, the webmail's messages, the users registry and the login, the mail screen's folders and list, the accounts' own sessions and the restores. It registers no step. |

Text, links, fields, buttons, the status code and the headers of a page, and the accessibility audit, are webship-js's
own steps (`I should see "..."`, `I follow "..."`).

## How the steps find things and wait

- **By what a person reads.** A folder is named as the folder list shows it ("Inbox", "Sent"), a message by its
  subject, a recipient by its address or by a handle of the users registry, an identity as Settings shows it
  ("Name <address>"), a preference by its label and its section, a contact or a group by its name.
- **No fixed sleeps.** The steps wait on the webmail's own signals: while one of its requests runs, it shows a
  "Loading..." message and keeps `rcmail.busy`; a step waits for both to go, then reads the page. Its answers are
  messages ("Message sent successfully.", "Login failed.") that go after a few seconds: a script the pack adds to every
  page records each one as it comes, even one shown just before the webmail goes to another page.
- **The webmail's own windows.** A message opens in the preview on the right of the list, a contact and a setting in
  the frame of their screen, a folder to move to in the webmail's folder menu, a question ("Are you sure...") in its
  dialog: the steps work in each the way a person does.
- **What a scenario changes comes back.** The restores go through the account's own session of the webmail (logged in
  once a run with the account's address and password, as its login form does), with the webmail's own requests:
  the marks of a folder's messages are set back, a deleted or moved message comes back, a sent message and a saved
  draft are deleted for good (to the trash, then from it), and what a step made in the settings or the address book is
  deleted. A scenario deletes what it made: something the webmail had and a scenario deleted is not put back (the
  counts of the pack's CI say so).
- **Failures say what was found.** `The message list shows no "Webship weekly report". It shows "Lunch on Friday", …`,
  with a hint on where to look.

## Accounts

The suite never creates or deletes an account: an account is the mail server's, and Roundcube keeps no account of its
own (it records one at its first login). List the accounts the mail server has in `worldParameters.users`, by a handle
the scenarios use, each with its `username` (its address) and its `password`, and its `name` as its identity shows it:

```javascript
users: {
  alice: { username: 'alice@example.com', password: process.env.RC_ALICE_PASSWORD, name: 'Alice Test' },
  bob: { username: 'bob@example.com', password: process.env.RC_BOB_PASSWORD, name: 'Bob Test' },
},
```

A recipient that is an account of the registry gets its copy of a sent message taken away when the scenario ends.

## Test users

The accounts this repository's suite logs in as, exactly as `cucumber.js` lists them in `worldParameters.users` (the
default values; the `RC_<HANDLE>_USER`, `RC_<HANDLE>_PASSWORD`, `RC_<HANDLE>_EMAIL` and `RC_<HANDLE>_NAME` variables
replace them). The build script gives them to the mail server.

```json
{
  "alice": { "username": "alice@example.com", "password": "dD.123123ddd", "email": "alice@example.com", "name": "Alice Test" },
  "bob": { "username": "bob@example.com", "password": "dD.123123ddd", "email": "bob@example.com", "name": "Bob Test" }
}
```

These are the two accounts and what each has in the webmail:

- `alice`: the account the scenarios read and write the mail of: four messages in her inbox, one in her sent folder,
  one in a folder of her own ("Projects"), two contacts and a group, a response.
- `bob`: the account Alice writes to and hears from: one message in his inbox.

They are accounts of a throwaway test mail server, with a placeholder password, not accounts of any real one.

## The test webmail

[`.github/scripts/build-ddev-site.sh`](.github/scripts/build-ddev-site.sh) builds the webmail the suite of this
repository runs against, in a DDEV project of type `php` served by Apache, with PHP 8.3 (or `PHP_VERSION`) and Node.js
24. `ROUNDCUBE_VERSION` names another release. The build makes:

- the latest Roundcube from its releases (the complete package, with its dependencies), with `public_html/` as its web
  root (Apache passes on the `static.php/<path>` addresses its scripts and styles are served at);
- its configuration: the database of the container, the mail server beside it, the plugins of the release's own
  sample configuration (`archive`, `zipdownload`), the Elastic skin, the time zone UTC and the messages of a folder
  listed by date, the newest first (so a list reads the same on every machine, and after a restore), and the default
  folders made at the first login;
- its database, by its own `bin/initdb.sh`;
- the mail server: GreenMail (Apache-2.0), the IMAP and SMTP test server Roundcube's own CI runs its browser tests
  against, as a service of the DDEV project (`.ddev/docker-compose.greenmail.yaml`), with the two accounts of
  [Test users](#test-users) and their passwords asked for;
- the test content, written by [`site/mail-site.php`](site/mail-site.php) with Roundcube's own classes (its IMAP
  storage, its user, contacts and collected addresses), started the way its own `bin/` scripts start:

| What | The test content |
| --- | --- |
| Alice's inbox | "Webship weekly report" (unread), "The test plan, attached" (unread, with `test-plan.txt`), "Webship news: November" (an HTML message, read), "Lunch on Friday" (read, flagged) |
| Alice's other folders | Sent: "Notes from the meeting"; a folder of her own, "Projects": "Webship project plan" |
| Bob's inbox | "Notes from the meeting" (read) |
| Alice's address book | "Bob Test" and "Carol Test", and the group "Webship team" with Bob Test |
| Alice's settings | Her identity "Alice Test <alice@example.com>", the response "Thanks" ("Thank you, I will look at it today.") |
| Collected recipients | Bob among Alice's, Alice among Bob's (so a message between them collects nothing new) |

CI builds it twice, see [`.github/workflows/test.yml`](.github/workflows/test.yml): on PHP 8.3 (with the assertions that
must fail) and on PHP 8.1. Each lane runs the suite twice and compares what the webmail holds before the first run and
after each run (`COUNTS_ONLY=1`):

- the users;
- per account, its folders and their subscriptions, and per folder its messages, the unread ones and the flagged ones;
- per account, its contacts, groups and their members, and its collected recipients and trusted senders;
- per account, its identities, its responses and its preferences.

Roundcube keeps a deleted contact, group, identity or response in its tables, marked deleted: the rows a person sees
are counted. Not counted in the preferences: what the webmail keeps there by itself (the `client_hash` every login
writes, and the fields the search box remembers for each folder), and a preference set back to the webmail's default.
Not counted either: the sessions, the caches and the saved searches.

GreenMail keeps its mailboxes in memory: after a restart of the DDEV project, and after a run that was stopped half
way, `RESET_ONLY=1 SITE_DIR="$PWD/roundcube-webmail" roundcube-steps/.github/scripts/build-ddev-site.sh` puts the
webmail back as the build left it:

- every folder of the two accounts emptied and written again, and the folders a run made removed;
- the address books, groups, identities, responses and collected addresses as the build made them (with what a run
  deleted, kept marked by Roundcube, gone for good);
- the preferences as they were.

## Steps

One example of each step; the JSDoc block above each definition holds five.

### `roundcube-session.steps.js` (6)

- `Given I am logged in to the webmail as "alice"`
- `When I log in to the webmail with the address "alice@example.com" and the password "Not-the-password-1"`
- `Then the webmail should refuse the login with "Login failed."`
- `Then I should be logged in to the webmail as "alice@example.com"`
- `When I log out of the webmail`
- `Then the webmail should say "Message(s) moved to Trash successfully."`

### `roundcube-mail.steps.js` (12)

- `When I open the folder "Sent"`
- `Then the folder "Inbox" should show 2 unread`
- `Then the message list should show "Webship weekly report"`
- `Then the message list should show "Lunch on Friday", "Webship weekly report" in this order`
- `Then the message "Webship weekly report" should be unread`
- `When I open the message "The test plan, attached"`
- `Then the message should be from "Bob Test"`
- `Then the message should list the attachment "test-plan.txt"`
- `When I mark the message "Webship weekly report" as flagged`
- `When I delete the message "Webship news: November"`
- `When I move the message "Webship weekly report" to the folder "Projects"`
- `When I search the mail for "report"`

### `roundcube-compose.steps.js` (10)

- `When I start a new message`
- `When I reply to the message "Webship weekly report"`
- `When I write to "bob@example.com"`
- `When I set the subject to "Webship test hello"`
- `When I write the text "A test mail from the scenario."`
- `When I insert the response "Thanks"`
- `Then the message should go to "Bob Test"`
- `When I send the message`
- `When I save the message as a draft`
- `When I discard the message`

### `roundcube-settings.steps.js` (12)

- `When I create the folder "Webship test folder"`
- `When I rename the folder "Projects" to "Webship test projects"`
- `When I delete the folder "Webship test folder"`
- `Then the folder list should show "Webship test folder"`
- `When I add the identity "Alice at work" with the address "alice@example.com"`
- `When I delete the identity "Webship test identity <alice@example.com>"`
- `Then the identities should list "Alice Test <alice@example.com>"`
- `When I add the response "Webship test response" with the text "I will answer tomorrow."`
- `When I delete the response "Webship test response"`
- `Then the responses should list "Thanks"`
- `When I set the preference "Time format" to "07:30 AM" in "User Interface"`
- `Then the preference "Time format" in "User Interface" should be "07:30 AM"`

### `roundcube-contacts.steps.js` (10)

- `When I add the contact "Webship Tester" with the address "tester@example.com"`
- `Then the contact list should show "Bob Test"`
- `When I open the contact "Bob Test"`
- `Then the contact should show "bob@example.com"`
- `When I delete the contact "Webship Tester"`
- `When I create the group "Webship test group"`
- `Then the address book should list the group "Webship team"`
- `When I add the contact "Carol Test" to the group "Webship team"`
- `Then the group "Webship team" should list "Bob Test"`
- `When I delete the group "Webship test group"`

## Phrases shared with other packs

None of this pack's phrases matches one of webship-js (`npm run test:examples` checks it). The platform packs are
not meant to be loaded together (one `cucumber.js` profile per system). Loaded beside each of the
46 packs published so far, these phrases of this pack also match one of theirs:

| Phrase of this pack | Also in |
| --- | --- |
| `I create the folder "…"` | nextcloud |
| `I delete the group "…"` | buddypress |
| `I delete the message "…"` | phpbb |
| `I open the contact "…"` | mautic |
| `I open the folder "…"` | nextcloud |
| `I open the message "…"` | phpbb |
| `the message "…" should be unread` | phpbb |
| `the message should be from "…"` | phpbb |

## Roundcube's own tests and this pack

Roundcube ships its own browser tests (`tests/Browser`, on Laravel Dusk), which its CI runs against GreenMail, the mail
server the test webmail of this pack uses too. Their flows are the logic these steps check, through the pages a person
uses:

| Roundcube's own browser tests (1.7.7) | In this pack |
| --- | --- |
| `Logon/LoginTest.php`, `Logon/LogoutTest.php`: the login form, a login that lands on the mail, the logout | `session.feature`: a wrong password refused, a login, the account shown, the logout |
| `Mail/ListTest.php`, `Mail/MailTest.php`: the message list, its unread marks, its toolbar and menus | `mail.feature`: the inbox, its order, its unread and flagged messages, marking |
| `Mail/PreviewTest.php`, `Mail/OpenTest.php`: a message in the preview, its sender, its attachments | `mail.feature`: a message with an attachment opened, its sender, recipient, subject, text and attachment |
| `Mail/ComposeTest.php`: the compose screen, its fields, the recipient input | `compose.feature`: a message written, sent and received; a reply, a reply to all, a forward, a draft |
| `Settings/FoldersTest.php`: the folder list, a folder created | `folders.feature`: folders made, renamed and deleted |
| `Settings/IdentitiesTest.php`, `Settings/ResponsesTest.php`: identities and responses created, updated and deleted; responses in the composer | `settings.feature`, `compose.feature`: an identity and a response added and deleted, a response inserted |
| `Settings/PreferencesTest.php`, `Settings/Preferences/GeneralTest.php`: the sections of the preferences, the general one | `settings.feature`: preferences of "User Interface" set |
| `Contacts/ContactsTest.php`, `Contacts/GroupsTest.php`: the contacts, groups created, renamed and deleted | `contacts.feature`: the contacts and the group, a contact added and deleted, a group made, given a contact, deleted |

Not in this pack: `Contacts/ImportTest.php`, `Contacts/ExportTest.php`, `Contacts/PrintTest.php`, `Mail/PrintTest.php`,
`Mail/GetunreadTest.php`, `Settings/AboutTest.php` and `Settings/Preferences/ServerTest.php`.

## Testing this package

```bash
npm ci
npm run test:examples    # every step's JSDoc examples match it and nothing else; every feature step resolves
npm run test:paths       # a feature named on the command line runs alone
npx cucumber-js --dry-run
SITE_DIR="$PWD/../roundcube-webmail" .github/scripts/build-ddev-site.sh
npx cucumber-js          # the whole suite
npm run test:must-fail   # the assertions that must fail, each with its message and a hint
PHP_VERSION=8.1 SITE_DIR="$PWD/../roundcube-webmail-81" .github/scripts/build-ddev-site.sh
npx cucumber-js
```

The second build makes a project of the same name, so remove the first one before it (`ddev delete -Oy roundcubesteps`).

## How the steps were written

Every step was written from a round of manual testing of the real local webmail in the browser first. Each screen it
touches was opened as the account the step works as, its lists, labels and messages were noted, and the signal it
gives while it works was found: the "Loading..." message and the busy state of the webmail's requests, the messages it
answers with, the frames a message, a contact and a setting open in, its menus and its dialogs.

That round, and the counts of the webmail before and after each run, found what the steps and their restores must
handle:

- the release's `public_html/` serves its scripts and styles at `static.php/<path>`, which DDEV's nginx sends to
  `index.php`: the test webmail is served by Apache, which passes them on;
- opening a message marks it read, and so does the webmail's "display next" after a delete or a move, which opens the
  next message: the restores set the marks of a folder's messages back;
- a message deleted or moved stays in the list's markup, hidden, until the list is read again: a step reads the rows
  that show;
- the webmail lists a folder in the order its messages arrived there by default, so a message a restore moved back
  would come first: the test webmail sorts by date;
- sending collects the recipients the address book does not hold ("Collected Recipients"): the restore of a sent
  message deletes the ones it collected;
- Roundcube keeps a deleted contact, group, identity or response in its tables, marked deleted; every login writes a
  new `client_hash` into the preferences, the search box remembers its fields for each folder there, and a folder
  saved writes an empty list of threaded folders: the counts read what a person sees;
- a form of the settings sent by Ajax is not saved: a restore sends it the way the settings' frame does;
- on Roundcube 1.7.7, once a group was made on the address book's page, "Assign to group..." offers that group only:
  `insert_contact_group` (`program/js/app.js`) empties the webmail's own list of groups when the list has no `length`,
  which a list of groups by key never has. The step that puts a contact in a group reads the address book again first.

## License

MIT, see [LICENSE](LICENSE).

## Logo

The logo in this README is the Roundcube logo the release ships in its Elastic skin (`skins/elastic/images/logo.svg`
of Roundcube 1.7.7). The contents of that skin's folder are under the Creative Commons Attribution-ShareAlike 3.0
licence, the skin by Aleksander Machniak; the logo stays under that licence, and is not part of the npm package. The
Roundcube name and logo belong to their owners; this pack is not affiliated with or endorsed by them.
