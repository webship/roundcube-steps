'use strict';

// Shared plumbing of the steps: the webmail's addresses (?_task=…&_action=…), opening a page and waiting for the
// webmail's own signals, the messages it answers with, the users registry and the logins, the accounts' own sessions
// that put back what a scenario changed, and the registry of those restores.
//
// This file registers no step.
//
// The webmail sends its requests by Ajax (rcmail.http_request): while one runs, it shows a "Loading..." message and
// keeps `rcmail.busy`; the steps wait for both to go, never for a fixed time. Its answers are messages in
// #messagestack ("Message(s) moved to Trash successfully.", "Login failed.") that go after a few seconds: a script the
// pack adds to every page records each one as it comes, so a step reads it even when it is gone.

const path = require('path');
const { gotoUrl, friendly, onNewPage } = require('webship-js/tests/step-definitions/webship');

// ---------------------------------------------------------------------------
// Budgets and text
// ---------------------------------------------------------------------------

/** The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 10 seconds. */
function budget(world) {
  const page = Number(world && world.parameters && world.parameters.minWaitTime && world.parameters.minWaitTime.page) || 0;
  return Math.max(10000, page * 3);
}

function clean(text) {
  return String(text == null ? '' : text).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/** Two texts are the same, letter case and spacing aside. */
function same(a, b) {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

/** A text holds another, letter case and spacing aside. */
function holds(text, part) {
  return clean(text).toLowerCase().includes(clean(part).toLowerCase());
}

function listed(values) {
  const list = (values || []).filter((v) => clean(v));
  return list.length ? list.map((v) => `"${clean(v)}"`).join(', ') : '(none)';
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The quoted values of a phrase's list: "A", "B" and "C". */
function quoted(list) {
  return [...String(list).matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// The webmail's addresses
// ---------------------------------------------------------------------------

function siteRoot(world) {
  return String((world.parameters && world.parameters.launchUrl) || world.launchUrl || '').replace(/\/+$/, '');
}

/** The address of a screen of the webmail by its task and action: ?_task=…&_action=…. */
function rcUrl(world, task, action = '', query = '') {
  return `${siteRoot(world)}/?_task=${task}${action ? `&_action=${action}` : ''}${query ? `&${query}` : ''}`;
}

/** The address a page is on, without its tokens, for a message. */
function shown(url) {
  return String(url || '').replace(/(_token|_id)=[A-Za-z0-9]+/g, '$1=…');
}

// ---------------------------------------------------------------------------
// Pages and the webmail's signals
// ---------------------------------------------------------------------------

const CUT = /ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|chrome-error:\/\/chromewebdata|ERR_ABORTED|frame was detached/;

/** Is the webmail of a page or a frame quiet: loaded, no request of its own running, no "Loading..." message? */
const QUIET = () => document.readyState === 'complete'
  && !(window.rcmail && window.rcmail.busy)
  && !document.querySelector('#messagestack div.loading, #messagestack div.busy');

/** Wait until the page and its frames are quiet. */
async function settle(page, timeout) {
  const limit = timeout || 15000;
  await page.waitForLoadState('load', { timeout: limit }).catch(() => {});
  await page.waitForFunction(QUIET, null, { timeout: limit, polling: 100 }).catch(() => {});
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    await frame.waitForFunction(QUIET, null, { timeout: limit, polling: 100 }).catch(() => {});
  }
}

/** Open an address and wait for the page to be quiet; a cut connection (the machine's network changed) goes again. */
async function openIn(page, url, timeout) {
  const deadline = Date.now() + 30000;
  let response = null;
  for (;;) {
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout || 60000 });
      break;
    } catch (err) {
      if (!CUT.test(String(err && err.message)) || Date.now() > deadline) {
        await gotoUrl(page, url);
        break;
      }
      await page.waitForTimeout(1000);
    }
  }
  await settle(page, timeout);
  return response;
}

async function open(world, url) {
  const response = await openIn(world.page, url, budget(world) * 3);
  world.__lastStatus = response ? response.status() : null;
  return response;
}

/** Run what sends a form, a click or a key, then wait for the page to be quiet again. */
async function act(page, fn, timeout) {
  await fn();
  await page.waitForTimeout(150);
  await settle(page, timeout || 30000);
}

/**
 * Poll a reading until it satisfies a check, or fail with what the last reading says (and, when the explanation gives
 * no hint of its own, how long the step waited).
 */
async function eventually(page, read, check, explain, timeout) {
  const limit = timeout || 10000;
  const deadline = Date.now() + limit;
  let value;
  for (;;) {
    value = await read().catch(() => undefined);
    if (value !== undefined && check(value)) return value;
    if (Date.now() > deadline) {
      const why = await explain(value);
      if (!why.hint) why.hint = `The step read the page again for ${Math.round(limit / 1000)} seconds; the webmail answers a request in its own time, and a step waits for it.`;
      throw friendly(why);
    }
    await page.waitForTimeout(150);
  }
}

/** The task and action of the page: "mail", "compose", "addressbook", "settings/folders", "login". */
async function screen(page) {
  return page.evaluate(() => (window.rcmail && window.rcmail.env ? `${window.rcmail.env.task || ''}${window.rcmail.env.action ? `/${window.rcmail.env.action}` : ''}` : '')).catch(() => '');
}

async function pageSummary(world) {
  const page = world.page;
  const said = await messages(page);
  const title = clean(await page.title().catch(() => ''));
  return `the page shows "${title || '(no title)'}" at ${shown(page.url())}${said.length ? `, and says ${listed(said.slice(-3).map((m) => m.text))}` : ''}`;
}

/** A frame of the page by its element's id (#messagecontframe, #preferences-frame, #contact-frame), once it loaded. */
async function frameOf(world, id) {
  const page = world.page;
  const handle = await page.waitForSelector(`#${id}`, { state: 'attached', timeout: budget(world) }).catch(() => null);
  const frame = handle ? await handle.contentFrame() : null;
  if (!frame) throw friendly({ message: `The webmail shows no #${id} frame: ${await pageSummary(world)}.`, hint: 'Open what shows it first: a message, a contact or a setting.' });
  await frame.waitForLoadState('load', { timeout: budget(world) }).catch(() => {});
  await frame.waitForFunction(QUIET, null, { timeout: budget(world), polling: 100 }).catch(() => {});
  return frame;
}

// ---------------------------------------------------------------------------
// The webmail's messages: recorded as they come, read in order
// ---------------------------------------------------------------------------

const MESSAGE_RECORDER = `(() => {
  if (window.__webshipMessages) return;
  // Kept in the tab's session storage too: the webmail shows some answers just before it goes to another page
  // ("Message sent successfully." on the compose screen, then the list), and a step reads them on the next page.
  const KEY = '__webshipMessages';
  let kept = [];
  try { kept = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { kept = []; }
  window.__webshipMessages = kept;
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(window.__webshipMessages.slice(-50))); } catch (e) { /* no storage */ } };
  const seen = new WeakSet();
  const kindOf = (c) => /alert-success|confirmation/.test(c) ? 'success' : (/alert-danger|error/.test(c) ? 'error' : (/alert-warning|warning/.test(c) ? 'warning' : (/loading|busy/.test(c) ? 'loading' : 'info')));
  const take = () => {
    const stack = document.getElementById('messagestack');
    if (!stack) return;
    stack.querySelectorAll(':scope > div').forEach((d) => {
      if (seen.has(d)) return;
      const text = d.textContent.replace(/\\s+/g, ' ').trim();
      if (!text) return;
      seen.add(d);
      window.__webshipMessages.push({ kind: kindOf(d.className), text, at: Date.now() });
      save();
    });
  };
  const watch = () => {
    take();
    new MutationObserver(() => take()).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();`;

/** Make every page of the scenario record the webmail's messages. */
async function recordMessages(page) {
  if (!page || page.__webshipRecorder) return;
  page.__webshipRecorder = true;
  await page.addInitScript(MESSAGE_RECORDER).catch(() => {});
  await page.evaluate(MESSAGE_RECORDER).catch(() => {});
}

/** The messages the page showed since it loaded, oldest first, but the "Loading..." ones: [{ kind, text }]. */
async function messages(page) {
  return page.evaluate(() => (window.__webshipMessages || []).filter((m) => m.kind !== 'loading').map((m) => ({ kind: m.kind, text: m.text }))).catch(() => []);
}

/** Forget the messages so far: the next step reads only what comes after it. */
async function forgetMessages(page) {
  await page.evaluate(() => {
    if (window.__webshipMessages) window.__webshipMessages.length = 0;
    try { sessionStorage.removeItem('__webshipMessages'); } catch (e) { /* no storage */ }
  }).catch(() => {});
}

/** Wait for a message of the webmail that holds a text. */
async function expectMessage(world, expected, hint) {
  return eventually(world.page, () => messages(world.page), (all) => all.some((m) => holds(m.text, expected)), async (all) => ({
    message: `The webmail does not say "${expected}". ${(all || []).length ? `It says ${listed(all.map((m) => m.text))}` : `It said nothing (${await pageSummary(world)})`}.`,
    hint: hint || 'The webmail answers in the message box at the bottom of the window; its words are the ones of the language it runs in.',
  }), budget(world));
}

// ---------------------------------------------------------------------------
// The users registry and the login
// ---------------------------------------------------------------------------

/** An account of the users registry by its handle: { handle, username, password, email, name }. */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The user "${handle}" is not in the users registry. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: 'Add it to worldParameters.users in cucumber.js. The account itself is the mail server\'s, made once by the build, never by a feature.',
    });
  }
  if (!entry.username || !entry.password) {
    throw friendly({ message: `The user "${handle}" has no ${entry.username ? 'password' : 'user name'} in the users registry.`, hint: `Set worldParameters.users.${handle}.username and .password in cucumber.js.` });
  }
  return { handle, username: entry.username, password: entry.password, email: entry.email || (/@/.test(entry.username) ? entry.username : ''), name: entry.name || '' };
}

/** The handle of an account of the registry by its address, or null. */
function handleOf(world, address) {
  const users = (world.parameters && world.parameters.users) || {};
  const wanted = clean(address).toLowerCase();
  for (const [handle, entry] of Object.entries(users)) {
    if ([entry.username, entry.email].some((v) => clean(v).toLowerCase() === wanted)) return handle;
  }
  return null;
}

/** Log the scenario's browser in with a user name and a password; { ok, said } */
async function submitLogin(world, username, password) {
  const page = world.page;
  await recordMessages(page);
  await open(world, `${siteRoot(world)}/`);
  if (await page.locator('#rcmloginuser').count() === 0) {
    // A session is open: log it out first, the way the menu does.
    const logout = page.locator('#taskmenu a.logout');
    if (await logout.count()) await act(page, () => logout.click());
    await open(world, `${siteRoot(world)}/`);
  }
  const user = page.locator('#rcmloginuser');
  await user.waitFor({ state: 'visible', timeout: budget(world) }).catch(async (err) => {
    throw friendly({ message: `The login form of the webmail did not appear: ${await pageSummary(world)}.`, cause: err, hint: 'The webmail\'s login is its front page: check launchUrl in cucumber.js.' });
  });
  await forgetMessages(page);
  await user.fill(username);
  await page.locator('#rcmloginpwd').fill(password);
  await Promise.all([
    page.waitForURL(/_task=(mail|addressbook|settings)/, { timeout: budget(world) }).catch(() => {}),
    page.locator('#rcmloginsubmit').click(),
  ]);
  await settle(page, budget(world));
  if (/_task=(mail|addressbook|settings)/.test(page.url()) && await page.locator('#rcmloginuser').count() === 0) return { ok: true, said: [] };
  const said = await eventually(page, () => messages(page), (m) => m.length > 0, async () => ({ message: '' }), 5000).catch(() => []);
  return { ok: false, said: (said || []).map((m) => m.text) };
}

async function logIn(world, handle) {
  const user = resolveUser(world, handle);
  const outcome = await submitLogin(world, user.username, user.password);
  if (!outcome.ok) {
    throw friendly({
      message: `"${handle}" (${user.username}) could not log in to the webmail: ${outcome.said.length ? `it says ${listed(outcome.said)}` : await pageSummary(world)}.`,
      hint: 'Check the account in the users registry of cucumber.js and on the mail server (the build makes it there).',
    });
  }
  world.__rcAccount = user;
  return user;
}

/** The account the scenario's browser is logged in as, or a failure that says to log in first. */
function account(world) {
  if (!world.__rcAccount) throw friendly({ message: 'Nobody is logged in to the webmail in this scenario.', hint: 'Log in first: Given I am logged in to the webmail as "alice".' });
  return world.__rcAccount;
}

// ---------------------------------------------------------------------------
// The restores of a scenario
// ---------------------------------------------------------------------------

/** Ask for something to be put back when the scenario ends, whatever its outcome; the newest runs first. */
function afterScenario(world, job) {
  if (!world.mailCleanup) world.mailCleanup = [];
  world.mailCleanup.push(job);
}

function playwrightModule() {
  const from = [process.cwd(), __dirname, path.dirname(require.resolve('webship-js/package.json', { paths: [process.cwd(), __dirname] }))];
  return require(require.resolve('playwright', { paths: from }));
}

/** The browser options of the project (playwright.config): its HTTPS. */
function transportOptions() {
  try {
    const config = require(path.join(process.cwd(), 'playwright.config'));
    const use = (config && (config.default || config).use) || {};
    return { ignoreHTTPSErrors: use.ignoreHTTPSErrors !== false };
  } catch {
    return { ignoreHTTPSErrors: true };
  }
}

// The accounts' own sessions, by site and account: one request context a run each, logged in once.
const SESSIONS = new Map();

/**
 * An account's own session of the webmail (not the scenario's browser): get(task, action, query) and
 * post(task, action, form), the webmail's own Ajax requests with its request token, page(task, action, query) for a
 * screen's HTML, and submit(task, action, form) for a form of the settings sent the way its frame sends it; each
 * answers { status, text, json }.
 * The restores go through it, so they work whatever the scenario's browser did (logged out, another account).
 */
async function accountSession(world, handle) {
  const user = resolveUser(world, handle);
  const key = `${siteRoot(world)}|${user.username}`;
  if (SESSIONS.has(key)) return SESSIONS.get(key);
  const run = (async () => {
    const request = await playwrightModule().request.newContext(transportOptions());
    const front = await (await request.get(`${siteRoot(world)}/`, { failOnStatusCode: false })).text();
    const loginToken = (front.match(/name="_token" value="([^"]+)"/) || [])[1];
    if (!loginToken) throw new Error('The login form of the webmail was not found, so what the scenario changed is not put back.');
    const answer = await request.post(`${siteRoot(world)}/?_task=login`, {
      form: { _token: loginToken, _task: 'login', _action: 'login', _timezone: 'UTC', _url: '', _user: user.username, _pass: user.password },
      failOnStatusCode: false,
    });
    const body = await answer.text();
    const token = (body.match(/"request_token":"([^"]+)"/) || [])[1];
    if (!token || /_task=login/.test(answer.url()) && !/"task":"mail"/.test(body)) throw new Error(`"${handle}" could not log in to the webmail (${answer.status()}), so what the scenario changed is not put back.`);
    const read = async (response) => {
      const text = await response.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* HTML */ }
      return { status: response.status(), text, json: parsed };
    };
    const headers = { 'X-Roundcube-Request': token, 'X-Requested-With': 'XMLHttpRequest' };
    const get = async (task, action, query = '') => read(await request.get(rcUrl(world, task, action, `_remote=1${query ? `&${query}` : ''}`), { headers, failOnStatusCode: false }));
    const page = async (task, action, query = '') => read(await request.get(rcUrl(world, task, action, query), { failOnStatusCode: false }));
    // The request token goes with every form too: the webmail checks it there for a request that is no Ajax one
    // (a form of the settings, sent as its frame sends it).
    const post = async (task, action, form) => read(await request.post(rcUrl(world, task, action), { form: { _remote: '1', _unlock: '0', _token: token, ...form }, headers, failOnStatusCode: false }));
    // A form of the settings sent the way its frame sends it: a plain post with the token, no Ajax.
    const submit = async (task, action, form) => read(await request.post(rcUrl(world, task, action), { form: { _token: token, ...form }, failOnStatusCode: false }));
    return { request, get, page, post, submit, token, user };
  })();
  SESSIONS.set(key, run);
  run.catch(() => SESSIONS.delete(key));
  return run;
}

/** Close the run's sessions once the run ends. */
async function sessionsEnd() {
  const runs = [...SESSIONS.values()];
  SESSIONS.clear();
  for (const run of runs) {
    try { await (await run).request.dispose(); } catch { /* gone */ }
  }
}

/** The JavaScript calls of an answer of the webmail (its `exec`), as text. */
function execOf(answer) {
  return String((answer && answer.json && answer.json.exec) || '');
}

/** Read the JSON arguments of every `this.<name>(…)` call of an exec text: [[arg1, arg2, …], …]. */
function callsOf(exec, name) {
  const out = [];
  const marker = `this.${name}(`;
  let at = exec.indexOf(marker);
  while (at >= 0) {
    let depth = 0;
    let i = at + marker.length - 1;
    let inString = false;
    for (; i < exec.length; i += 1) {
      const c = exec[i];
      if (inString) {
        if (c === '\\') { i += 1; continue; }
        if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === '(' || c === '[' || c === '{') depth += 1;
      else if (c === ')' || c === ']' || c === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const args = exec.slice(at + marker.length, i);
    try { out.push(JSON.parse(`[${args}]`)); } catch { /* not JSON */ }
    at = exec.indexOf(marker, i);
  }
  return out;
}

/**
 * The messages of a folder of an account, as its own session lists them: [{ uid, subject, from, seen, flagged }],
 * every page of the list.
 */
async function folderMessages(world, handle, folder) {
  const session = await accountSession(world, handle);
  const rows = [];
  for (let page = 1; page <= 20; page += 1) {
    const answer = await session.get('mail', 'list', `_mbox=${encodeURIComponent(folder)}&_page=${page}&_refresh=1`);
    const exec = execOf(answer);
    for (const [uid, cols, flags] of callsOf(exec, 'add_message_row')) {
      rows.push({
        uid: Number(uid),
        subject: clean(String(cols.subject || '').replace(/<[^>]+>/g, '')),
        from: clean(String(cols.fromto || '').replace(/<[^>]+>/g, '')),
        seen: !!(flags && flags.seen),
        flagged: !!(flags && flags.flagged),
      });
    }
    const count = (answer.json && answer.json.env && answer.json.env.pagecount) || 1;
    if (page >= count) break;
  }
  return rows;
}

/** Set a flag of messages through an account's own session: read, unread, flagged, unflagged. */
async function markMessages(world, handle, folder, uids, flag) {
  if (!uids.length) return;
  const session = await accountSession(world, handle);
  const answer = await session.post('mail', 'mark', { _uid: uids.join(','), _flag: flag, _mbox: folder });
  if (answer.status !== 200) throw new Error(`The messages ${uids.join(', ')} of ${folder} could not be marked ${flag} (${answer.status}).`);
}

/** Move messages through an account's own session. */
async function moveMessages(world, handle, folder, uids, target) {
  if (!uids.length) return;
  const session = await accountSession(world, handle);
  const answer = await session.post('mail', 'move', { _uid: uids.join(','), _mbox: folder, _target_mbox: target });
  if (answer.status !== 200) throw new Error(`The messages ${uids.join(', ')} of ${folder} could not be moved to ${target} (${answer.status}).`);
}

/**
 * Delete messages for good through an account's own session: the webmail moves a deleted message to Trash, and
 * deletes it for good when it is deleted there; so the messages go to Trash first (but those already there), then
 * the ones that came to Trash are deleted there.
 */
async function deleteForGood(world, handle, folder, uids) {
  if (!uids.length) return;
  const session = await accountSession(world, handle);
  const trash = 'Trash';
  if (folder !== trash) {
    const before = Math.max(0, ...(await folderMessages(world, handle, trash)).map((m) => m.uid));
    await moveMessages(world, handle, folder, uids, trash);
    const arrived = (await folderMessages(world, handle, trash)).filter((m) => m.uid > before).map((m) => m.uid);
    uids = arrived;
  }
  if (!uids.length) return;
  const answer = await session.post('mail', 'delete', { _uid: uids.join(','), _mbox: trash });
  if (answer.status !== 200) throw new Error(`The messages ${uids.join(', ')} could not be deleted from Trash (${answer.status}).`);
}

/** The highest uid of a folder of an account (0 when it is empty): what came after it is the scenario's. */
async function lastUid(world, handle, folder) {
  return Math.max(0, ...(await folderMessages(world, handle, folder)).map((m) => m.uid));
}

/** The ids of the contacts of an address book of an account (0: its own, 1: the collected recipients, 2: the trusted senders). */
async function contactIds(world, handle, source) {
  const session = await accountSession(world, handle);
  const ids = [];
  for (let page = 1; page <= 20; page += 1) {
    const answer = await session.get('addressbook', 'list', `_source=${source}&_page=${page}`);
    const found = callsOf(execOf(answer), 'add_contact_row').map((args) => String(args[0]));
    ids.push(...found);
    const count = (answer.json && answer.json.env && answer.json.env.pagecount) || 1;
    if (page >= count || !found.length) break;
  }
  return ids;
}

/** Delete contacts of an address book of an account through its own session. */
async function deleteContacts(world, handle, source, ids) {
  if (!ids.length) return;
  const session = await accountSession(world, handle);
  const answer = await session.post('addressbook', 'delete', { _cid: ids.join(','), _source: String(source) });
  if (answer.status !== 200) throw new Error(`The contacts ${ids.join(', ')} of the address book ${source} could not be deleted (${answer.status}).`);
}

/**
 * Keep the collected recipients of an account, once a scenario: a message it sends collects the addresses it wrote to
 * that its address book does not hold; the ones collected during the scenario go when it ends.
 */
async function keepCollected(world, handle) {
  if (!world.__rcCollected) world.__rcCollected = new Set();
  if (world.__rcCollected.has(handle)) return;
  world.__rcCollected.add(handle);
  const before = new Set(await contactIds(world, handle, 1));
  afterScenario(world, async () => {
    const added = (await contactIds(world, handle, 1)).filter((id) => !before.has(id));
    await deleteContacts(world, handle, 1, added);
  });
}

// ---------------------------------------------------------------------------
// The mail screen: its folders, its message list, a message selected
// ---------------------------------------------------------------------------

/** The folders of the mail screen: [{ name, path, unread }]. */
async function folders(page) {
  return page.$$eval('#mailboxlist li.mailbox > a', (as) => as.map((a) => ({
    name: (a.childNodes[0] && a.childNodes[0].textContent || a.textContent).replace(/\s+/g, ' ').trim(),
    path: a.getAttribute('rel') || '',
    unread: Number((a.querySelector('.unreadcount') || {}).textContent || 0),
  })));
}

/**
 * The rows of the message list: [{ subject, from, unread, flagged, selected }]. A row the webmail took away (a deleted
 * or moved message) is kept hidden until the list is read again: it is not counted.
 */
async function rows(page) {
  return page.$$eval('#messagelist tbody tr.message', (trs) => trs.filter((tr) => tr.style.display !== 'none' && (tr.offsetWidth || tr.offsetHeight)).map((tr) => ({
    subject: ((tr.querySelector('span.subject a') || tr.querySelector('.subject') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    from: ((tr.querySelector('span.fromto') || tr.querySelector('.fromto') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    unread: tr.classList.contains('unread'),
    flagged: tr.classList.contains('flagged'),
    selected: tr.classList.contains('selected'),
  })));
}

/** Be on the mail screen: open it when the page is another one. */
async function onMail(world) {
  const page = world.page;
  account(world);
  if (!/^mail(\/|$)/.test(await screen(page)) || await page.locator('#messagelist').count() === 0) {
    await open(world, rcUrl(world, 'mail'));
  }
  await page.locator('#messagelist').waitFor({ state: 'attached', timeout: budget(world) });
}

/** The folder the mail screen lists. */
async function currentFolder(page) {
  return page.evaluate(() => (window.rcmail && window.rcmail.env && window.rcmail.env.mailbox) || 'INBOX');
}

/** Open a folder by the name the folder list shows ("Inbox", "Sent") or its path. */
async function openFolder(world, name) {
  await onMail(world);
  const page = world.page;
  const all = await folders(page);
  const folder = all.find((f) => same(f.name, name)) || all.find((f) => same(f.path, name));
  if (!folder) throw friendly({ message: `The webmail has no folder "${name}". It has ${listed(all.map((f) => f.name))}.`, hint: 'A folder is named as the folder list shows it.' });
  await act(page, () => page.locator(`#mailboxlist li.mailbox > a[rel="${folder.path.replace(/"/g, '\\"')}"]`).click());
  await eventually(page, () => currentFolder(page), (f) => f === folder.path, async () => ({ message: `The folder "${name}" did not open.` }), budget(world));
  return folder;
}

/** The row of a message of the list by its subject, or a failure that says what the list shows. */
async function rowOf(world, subject) {
  const page = world.page;
  return eventually(page, () => rows(page), (list) => list.some((r) => same(r.subject, subject)), async (list) => ({
    message: `The message list shows no "${subject}". It shows ${listed((list || []).map((r) => r.subject))}.`,
    hint: 'A message is named by its subject; the list shows the folder that is open (open another one with: I open the folder "…").',
  }), budget(world)).then((list) => list.find((r) => same(r.subject, subject)));
}

/**
 * Keep what the messages of the open folder are (read or not, flagged or not), once a scenario a folder: when the
 * scenario ends, each message of the folder is set back as it was. A click on a message marks it read, and so does the
 * webmail's "display next" after a delete or a move, which opens the next message.
 */
async function keepFolderState(world) {
  const page = world.page;
  const folder = await currentFolder(page);
  const handle = account(world).handle;
  if (!handle) return folder;
  if (!world.__rcKept) world.__rcKept = new Set();
  const key = `${handle}|${folder}`;
  if (world.__rcKept.has(key)) return folder;
  world.__rcKept.add(key);
  const before = await folderMessages(world, handle, folder);
  afterScenario(world, async () => {
    const now = await folderMessages(world, handle, folder);
    const sets = { read: [], unread: [], flagged: [], unflagged: [] };
    for (const m of now) {
      const was = before.find((b) => b.uid === m.uid) || before.find((b) => same(b.subject, m.subject));
      if (!was) continue;
      if (was.seen !== m.seen) sets[was.seen ? 'read' : 'unread'].push(m.uid);
      if (was.flagged !== m.flagged) sets[was.flagged ? 'flagged' : 'unflagged'].push(m.uid);
    }
    for (const [flag, uids] of Object.entries(sets)) await markMessages(world, handle, folder, uids, flag);
  });
  return folder;
}

/**
 * Select a message of the list, as a click on it does: the preview opens it, and the webmail marks it read. What the
 * folder's messages were (read or not, flagged or not) comes back when the scenario ends.
 */
async function selectMessage(world, subject) {
  const page = world.page;
  const before = await rowOf(world, subject);
  const folder = await keepFolderState(world);
  const row = page.locator('#messagelist tbody tr.message').filter({ has: page.locator('span.subject a', { hasText: subject }) }).first();
  await act(page, () => row.locator('td.subject').click());
  await eventually(page, () => rows(page), (list) => list.some((r) => same(r.subject, subject) && r.selected), async () => ({ message: `The message "${subject}" could not be selected.` }), budget(world));
  return { before, folder };
}

module.exports = {
  budget,
  clean,
  same,
  holds,
  listed,
  escapeRegExp,
  quoted,
  siteRoot,
  rcUrl,
  shown,
  settle,
  openIn,
  open,
  act,
  eventually,
  screen,
  pageSummary,
  frameOf,
  recordMessages,
  messages,
  forgetMessages,
  expectMessage,
  resolveUser,
  handleOf,
  submitLogin,
  logIn,
  account,
  afterScenario,
  accountSession,
  sessionsEnd,
  execOf,
  callsOf,
  folderMessages,
  markMessages,
  moveMessages,
  deleteForGood,
  lastUid,
  contactIds,
  deleteContacts,
  keepCollected,
  folders,
  rows,
  onMail,
  currentFolder,
  openFolder,
  rowOf,
  keepFolderState,
  selectMessage,
  onNewPage,
};
