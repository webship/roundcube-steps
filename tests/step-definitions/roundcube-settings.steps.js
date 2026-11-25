'use strict';

// The settings: the folders (made, renamed, deleted), the identities (a name and an address a message goes out from),
// the responses (saved texts to insert into a message), and the preferences of a section. What a step makes is taken
// away when the scenario ends, and a preference it set or a folder it renamed is set back, through the account's own
// session. A scenario deletes what it made: something the site had and the scenario deleted is not put back (the
// counts of the pack's CI say so).

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./roundcube-helpers');

/** Open a screen of the settings: preferences, folders, identities, responses. */
async function onSettings(world, action) {
  h.account(world);
  await h.open(world, h.rcUrl(world, 'settings', action));
}

/** The rows of a list of the settings (#identities-table, #responses-table): [{ id, text }]. */
async function listRows(page, table) {
  return page.$$eval(`#${table} tbody tr`, (trs) => trs.filter((tr) => tr.style.display !== 'none').map((tr) => ({
    id: tr.id.replace(/^rcmrow/, ''),
    text: tr.textContent.replace(/\s+/g, ' ').trim(),
  })));
}

/** The folders of the folder settings: [{ name, path, subscribed }]. */
async function folderRows(page) {
  return page.$$eval('#subscription-table li.mailbox', (lis) => lis.filter((li) => !li.classList.contains('root') && li.style.display !== 'none').map((li) => {
    const name = li.querySelector(':scope > div.name, :scope > .name, :scope > a, :scope > div > span.name');
    const box = li.querySelector(':scope input[type=checkbox]');
    return {
      name: ((name || li).firstChild && (name || li).textContent || '').replace(/\s+/g, ' ').trim(),
      path: (box && box.value) || li.getAttribute('data-id') || '',
      subscribed: !!(box && box.checked),
    };
  }));
}

/** Click Save in the frame of the settings, and wait for the webmail's answer. */
async function saveFrame(world, frame, expected) {
  const page = world.page;
  await h.forgetMessages(page);
  await frame.locator('button.btn.btn-primary.submit, button.submit').first().click();
  await h.settle(page, h.budget(world));
  const said = await h.eventually(page, () => h.messages(page), (all) => all.some((m) => m.kind === 'success' || m.kind === 'error' || m.kind === 'warning'), async (all) => ({
    message: `The webmail did not answer the save: ${(all || []).length ? `it says ${h.listed(all.map((m) => m.text))}` : await h.pageSummary(world)}.`,
  }), h.budget(world));
  const problem = said.find((m) => m.kind === 'error' || m.kind === 'warning');
  if (problem) throw friendly({ message: `The webmail refused the save: "${problem.text}".`, hint: expected || 'Check the values the form was given.' });
}

/** Confirm the webmail's question of a delete ("Are you sure..."), and wait for its answer. */
async function confirmDelete(world) {
  const page = world.page;
  const dialog = page.locator('.ui-dialog:visible');
  await dialog.waitFor({ state: 'visible', timeout: h.budget(world) });
  await h.forgetMessages(page);
  await h.act(page, () => dialog.locator('.ui-dialog-buttonset button.mainaction').click());
}

// --------------------------------------------------------------------------- folders

/**
 * Make a folder in Settings > Folders ("Create"), at the top of the folder list or in a folder of it. It is deleted
 * when the scenario ends.
 *
 * Example #1: When I create the folder "Webship test folder"
 * Example #2: When I create the folder "Webship test archive" in "Projects"
 * Example #3: When we create the folder "Webship test folder"
 * Example #4: And I create the folder "Webship test reports" in "Inbox"
 * Example #5: When I create the folder "Webship test folder"
 *               Then the webmail should say "Folder created successfully."
 */
When(/^(?:I|we) create the folder "([^"]*)"(?: in "([^"]*)")?$/, async function (name, parent) {
  const user = h.account(this);
  await onSettings(this, 'folders');
  const page = this.page;
  await h.act(page, () => page.locator('a.create').first().click());
  const frame = await h.frameOf(this, 'preferences-frame');
  await frame.locator('input[name="_name"]').fill(name);
  if (parent) {
    const options = await frame.$$eval('select[name="_parent"] option', (os) => os.map((o) => ({ value: o.value, label: o.textContent.replace(/\s+/g, ' ').trim() })));
    const option = options.find((o) => h.same(o.label, parent)) || options.find((o) => h.same(o.value, parent));
    if (!option) throw friendly({ message: `No folder "${parent}" to put the folder in. The folders are ${h.listed(options.map((o) => o.label))}.`, hint: 'The folder is put in one the folder list shows.' });
    await frame.locator('select[name="_parent"]').selectOption(option.value);
  }
  if (user.handle) {
    h.afterScenario(this, async () => {
      const session = await h.accountSession(this, user.handle);
      const list = await session.page('settings', 'folders');
      const paths = [...list.text.matchAll(/name="_subscribed\[\]"[^>]*?value="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
      const path = paths.find((p) => p === name || p.endsWith(`.${name}`) || p.endsWith(`/${name}`));
      if (path) await session.post('settings', 'delete-folder', { _mbox: path });
    });
  }
  await saveFrame(this, frame, 'A folder needs a name the mail server takes.');
});

/**
 * Rename a folder of Settings > Folders: select it, change its name, Save. Its old name comes back when the scenario
 * ends.
 *
 * Example #1: When I rename the folder "Projects" to "Webship test projects"
 * Example #2: When we rename the folder "Webship test folder" to "Webship test renamed"
 * Example #3: And I rename the folder "Projects" to "Webship test work"
 * Example #4: When I rename the folder "Webship test folder" to "Webship test reports"
 * Example #5: When I rename the folder "Projects" to "Webship test projects"
 */
When(/^(?:I|we) rename the folder "([^"]*)" to "([^"]*)"$/, async function (from, to) {
  const user = h.account(this);
  await onSettings(this, 'folders');
  const page = this.page;
  const rows = await folderRows(page);
  const row = rows.find((r) => h.same(r.name, from));
  if (!row) throw friendly({ message: `The folder settings list no folder "${from}". They list ${h.listed(rows.map((r) => r.name))}.`, hint: 'A folder is renamed by the name Settings > Folders shows.' });
  await h.act(page, () => page.locator('#subscription-table li.mailbox').filter({ hasText: from }).first().locator('a, .name').first().click());
  const frame = await h.frameOf(this, 'preferences-frame');
  await frame.locator('input[name="_name"]').fill(to);
  if (user.handle) {
    const oldPath = row.path || from;
    h.afterScenario(this, async () => {
      // The webmail renames a folder by its whole path; the new one is the old one's parent and the new name.
      const session = await h.accountSession(this, user.handle);
      const cut = Math.max(oldPath.lastIndexOf('.'), oldPath.lastIndexOf('/'));
      const newPath = `${cut >= 0 ? oldPath.slice(0, cut + 1) : ''}${to}`;
      const answer = await session.post('settings', 'rename-folder', { _folder_oldname: newPath, _folder_newname: oldPath });
      if (answer.status !== 200 || /errorsaving|display_message\([^)]*error/.test(answer.text)) throw new Error(`The folder "${to}" could not get its name "${from}" back (${answer.status}).`);
    });
  }
  await saveFrame(this, frame, 'A folder needs a name the mail server takes.');
});

/**
 * Delete a folder of Settings > Folders: select it, "Delete", and confirm. A scenario deletes a folder it made: a
 * folder the site had is not put back.
 *
 * Example #1: When I delete the folder "Webship test folder"
 * Example #2: When we delete the folder "Webship test archive"
 * Example #3: And I delete the folder "Webship test folder"
 * Example #4: When I delete the folder "Webship test reports"
 * Example #5: When I delete the folder "Webship test folder"
 *               Then the folder list should not show "Webship test folder"
 */
When(/^(?:I|we) delete the folder "([^"]*)"$/, async function (name) {
  await onSettings(this, 'folders');
  const page = this.page;
  const rows = await folderRows(page);
  if (!rows.some((r) => h.same(r.name, name))) throw friendly({ message: `The folder settings list no folder "${name}". They list ${h.listed(rows.map((r) => r.name))}.`, hint: 'A folder is deleted by the name Settings > Folders shows; a scenario deletes a folder it made.' });
  await h.act(page, () => page.locator('#subscription-table li.mailbox').filter({ hasText: name }).first().locator('a, .name').first().click());
  await page.locator('a.delete').first().click();
  await confirmDelete(this);
  await h.eventually(page, () => folderRows(page), (all) => !all.some((r) => h.same(r.name, name)), async () => ({ message: `The folder "${name}" is still listed after "Delete".` }), h.budget(this));
});

/**
 * The folder list (of the mail, or of the folder settings, whichever the page shows) shows a folder, or does not.
 *
 * Example #1: Then the folder list should show "Webship test folder"
 * Example #2: Then the folder list should not show "Webship test folder"
 * Example #3: And the folder list should show "Projects"
 * Example #4: Then the folder list should show "Webship test projects"
 * Example #5: Then the folder list should not show "Projects"
 */
Then(/^the folder list should( not)? show "([^"]*)"$/, async function (not, name) {
  const page = this.page;
  const read = async () => {
    if (await page.locator('#subscription-table').count()) return (await folderRows(page)).map((r) => r.name);
    return (await h.folders(page)).map((f) => f.name);
  };
  await h.eventually(page, read, (names) => names.some((n) => h.same(n, name)) === !not, async (names) => ({
    message: not ? `The folder list shows "${name}".` : `The folder list shows no "${name}". It shows ${h.listed(names || [])}.`,
  }), h.budget(this));
});

// --------------------------------------------------------------------------- identities

/** The identities of the account, by their text ("Alice Test <alice@example.com>"), from its own session. */
async function identityIds(world, handle, text) {
  const session = await h.accountSession(world, handle);
  const page = await session.page('settings', 'identities');
  return [...page.text.matchAll(/<tr id="rcmrow(\d+)"[^>]*>([\s\S]*?)<\/tr>/g)]
    .filter((m) => h.holds(m[2].replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>'), text))
    .map((m) => m[1]);
}

/**
 * Add an identity in Settings > Identities: a name and an address a message can go out from. It is deleted when the
 * scenario ends.
 *
 * Example #1: When I add the identity "Alice at work" with the address "alice@example.com"
 * Example #2: When we add the identity "Webship test identity" with the address "alice@example.com"
 * Example #3: And I add the identity "Alice Support" with the address "alice@example.com"
 * Example #4: When I add the identity "Bob at work" with the address "bob@example.com"
 * Example #5: When I add the identity "Webship test identity" with the address "alice@example.com"
 *               Then the identities should list "Webship test identity <alice@example.com>"
 */
When(/^(?:I|we) add the identity "([^"]*)" with the address "([^"]*)"$/, async function (name, address) {
  const user = h.account(this);
  await onSettings(this, 'identities');
  const page = this.page;
  await h.act(page, () => page.locator('a.create').first().click());
  const frame = await h.frameOf(this, 'preferences-frame');
  await frame.locator('input[name="_name"]').fill(name);
  await frame.locator('input[name="_email"]').fill(address);
  if (user.handle) {
    const before = new Set(await identityIds(this, user.handle, ''));
    h.afterScenario(this, async () => {
      const session = await h.accountSession(this, user.handle);
      for (const id of await identityIds(this, user.handle, `${name} <${address}>`)) {
        if (!before.has(id)) await session.post('settings', 'delete-identity', { _iid: id });
      }
    });
  }
  await saveFrame(this, frame, 'An identity needs an address the webmail takes.');
});

/**
 * Delete an identity of Settings > Identities by its text ("Name <address>"): select it, "Delete", and confirm.
 *
 * Example #1: When I delete the identity "Webship test identity <alice@example.com>"
 * Example #2: When we delete the identity "Alice at work <alice@example.com>"
 * Example #3: And I delete the identity "Webship test identity"
 * Example #4: When I delete the identity "Alice Support"
 * Example #5: When I delete the identity "Webship test identity <alice@example.com>"
 *               Then the identities should not list "Webship test identity"
 */
When(/^(?:I|we) delete the identity "([^"]*)"$/, async function (text) {
  await onSettings(this, 'identities');
  const page = this.page;
  const rows = await listRows(page, 'identities-table');
  if (!rows.some((r) => h.holds(r.text, text))) throw friendly({ message: `The identities list no "${text}". They list ${h.listed(rows.map((r) => r.text))}.`, hint: 'An identity is named as Settings > Identities shows it: "Name <address>".' });
  await h.act(page, () => page.locator('#identities-table tbody tr').filter({ hasText: text }).first().locator('td').first().click());
  await page.locator('a.delete').first().click();
  await confirmDelete(this);
  await h.eventually(page, () => listRows(page, 'identities-table'), (all) => !all.some((r) => h.holds(r.text, text)), async () => ({ message: `The identity "${text}" is still listed after "Delete".` }), h.budget(this));
});

/**
 * The identities of Settings > Identities list one ("Name <address>", or a part of it), or do not.
 *
 * Example #1: Then the identities should list "Alice Test <alice@example.com>"
 * Example #2: Then the identities should not list "Webship test identity"
 * Example #3: And the identities should list "Webship test identity <alice@example.com>"
 * Example #4: Then the identities should list "Alice Test"
 * Example #5: Then the identities should not list "Alice at work"
 */
Then(/^the identities should( not)? list "([^"]*)"$/, async function (not, text) {
  const page = this.page;
  if (await page.locator('#identities-table').count() === 0) await onSettings(this, 'identities');
  await h.eventually(page, () => listRows(page, 'identities-table'), (all) => all.some((r) => h.holds(r.text, text)) === !not, async (all) => ({
    message: not ? `The identities list "${text}".` : `The identities list no "${text}". They list ${h.listed((all || []).map((r) => r.text))}.`,
  }), h.budget(this));
});

// --------------------------------------------------------------------------- responses

/** The responses of the account by their name, from its own session. */
async function responseIds(world, handle, name) {
  const session = await h.accountSession(world, handle);
  const page = await session.page('settings', 'responses');
  return [...page.text.matchAll(/<tr id="rcmrow([^"]+)"[^>]*>([\s\S]*?)<\/tr>/g)]
    .filter((m) => !name || h.same(m[2].replace(/<[^>]+>/g, ' '), name))
    .map((m) => m[1]);
}

/**
 * Add a response in Settings > Responses: a name and the text it inserts into a message. It is deleted when the
 * scenario ends.
 *
 * Example #1: When I add the response "Webship test response" with the text "I will answer tomorrow."
 * Example #2: When we add the response "Webship test thanks" with the text "Thank you for the report."
 * Example #3: And I add the response "Webship test meeting" with the text "See you at the meeting."
 * Example #4: When I add the response "Webship test response" with the text "Received, thank you."
 * Example #5: When I add the response "Webship test response" with the text "I will answer tomorrow."
 *               Then the responses should list "Webship test response"
 */
When(/^(?:I|we) add the response "([^"]*)" with the text "([^"]*)"$/, async function (name, text) {
  const user = h.account(this);
  await onSettings(this, 'responses');
  const page = this.page;
  await h.act(page, () => page.locator('a.create').first().click());
  const frame = await h.frameOf(this, 'preferences-frame');
  await frame.locator('input[name="_name"]').fill(name);
  await frame.locator('textarea[name="_text"]').fill(text);
  if (user.handle) {
    const before = new Set(await responseIds(this, user.handle, ''));
    h.afterScenario(this, async () => {
      const session = await h.accountSession(this, user.handle);
      for (const id of await responseIds(this, user.handle, name)) {
        if (!before.has(id)) await session.post('settings', 'delete-response', { _id: id });
      }
    });
  }
  await saveFrame(this, frame, 'A response needs a name and a text.');
});

/**
 * Delete a response of Settings > Responses by its name: select it, "Delete", and confirm.
 *
 * Example #1: When I delete the response "Webship test response"
 * Example #2: When we delete the response "Webship test thanks"
 * Example #3: And I delete the response "Webship test meeting"
 * Example #4: When I delete the response "Webship test response"
 * Example #5: When I delete the response "Webship test response"
 *               Then the responses should not list "Webship test response"
 */
When(/^(?:I|we) delete the response "([^"]*)"$/, async function (name) {
  await onSettings(this, 'responses');
  const page = this.page;
  const rows = await listRows(page, 'responses-table');
  if (!rows.some((r) => h.same(r.text, name))) throw friendly({ message: `The responses list no "${name}". They list ${h.listed(rows.map((r) => r.text))}.`, hint: 'A response is named as Settings > Responses shows it.' });
  await h.act(page, () => page.locator('#responses-table tbody tr').filter({ hasText: name }).first().locator('td').first().click());
  await page.locator('a.delete').first().click();
  await confirmDelete(this);
  await h.eventually(page, () => listRows(page, 'responses-table'), (all) => !all.some((r) => h.same(r.text, name)), async () => ({ message: `The response "${name}" is still listed after "Delete".` }), h.budget(this));
});

/**
 * The responses of Settings > Responses list one by its name, or do not.
 *
 * Example #1: Then the responses should list "Thanks"
 * Example #2: Then the responses should not list "Webship test response"
 * Example #3: And the responses should list "Webship test response"
 * Example #4: Then the responses should list "Webship test thanks"
 * Example #5: Then the responses should not list "Webship test meeting"
 */
Then(/^the responses should( not)? list "([^"]*)"$/, async function (not, name) {
  const page = this.page;
  if (await page.locator('#responses-table').count() === 0) await onSettings(this, 'responses');
  await h.eventually(page, () => listRows(page, 'responses-table'), (all) => all.some((r) => h.same(r.text, name)) === !not, async (all) => ({
    message: not ? `The responses list "${name}".` : `The responses list no "${name}". They list ${h.listed((all || []).map((r) => r.text))}.`,
  }), h.budget(this));
});

// --------------------------------------------------------------------------- preferences

/** Open a section of Settings > Preferences by its name, and answer its frame. */
async function openSection(world, section) {
  await onSettings(world, 'preferences');
  const page = world.page;
  const names = await page.$$eval('#sections-table tbody tr', (trs) => trs.map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()));
  const index = names.findIndex((n) => h.same(n, section));
  if (index < 0) throw friendly({ message: `The preferences have no section "${section}". They have ${h.listed(names)}.`, hint: 'A section is named as Settings > Preferences lists it.' });
  await h.act(page, () => page.locator('#sections-table tbody tr').nth(index).locator('td').first().click());
  const frame = await h.frameOf(world, 'preferences-frame');
  await frame.locator('form').first().waitFor({ state: 'attached', timeout: h.budget(world) });
  return frame;
}

/** A preference of a section's form by its label: { name, kind, value, shown, options }. */
async function preference(frame, label) {
  return frame.evaluate((wanted) => {
    const norm = (t) => (t || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const row = [...document.querySelectorAll('form tr, form .form-group')].find((r) => {
      const title = r.querySelector('td.title label, label.col-form-label, td.title');
      return title && norm(title.textContent) === norm(wanted);
    });
    if (!row) return { missing: [...document.querySelectorAll('form td.title')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()) };
    const control = row.querySelector('select, input:not([type=hidden]), textarea');
    if (!control) return { missing: [] };
    if (control.tagName === 'SELECT') {
      const options = [...control.options].map((o) => ({ value: o.value, label: o.textContent.replace(/\s+/g, ' ').trim() }));
      return { name: control.name, kind: 'select', value: control.value, shown: (options.find((o) => o.value === control.value) || {}).label || '', options };
    }
    if (control.type === 'checkbox') return { name: control.name, kind: 'checkbox', value: control.checked ? 'on' : 'off', shown: control.checked ? 'on' : 'off' };
    return { name: control.name, kind: 'text', value: control.value, shown: control.value };
  }, label);
}

/** The form of a section as it is: its fields and their values, to post back. */
async function sectionForm(frame) {
  return frame.evaluate(() => {
    const form = document.querySelector('form');
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if ((el.type === 'checkbox' || el.type === 'radio') && !el.checked) continue;
      out[el.name] = el.value;
    }
    return out;
  });
}

/**
 * Set a preference of a section of Settings > Preferences by its label, then Save: a list's option by the label it
 * shows, a switch "on" or "off", or a text. The preferences come back as they were when the scenario ends.
 *
 * Example #1: When I set the preference "Time format" to "07:30 AM" in "User Interface"
 * Example #2: When I set the preference "Pretty dates" to "off" in "User Interface"
 * Example #3: When we set the preference "Date format" to "24.07.2026" in "User Interface"
 * Example #4: And I set the preference "Display next list entry after delete/move" to "off" in "User Interface"
 * Example #5: When I set the preference "Refresh (check for new messages, etc.)" to "never" in "User Interface"
 */
When(/^(?:I|we) set the preference "([^"]*)" to "([^"]*)" in "([^"]*)"$/, async function (label, value, section) {
  const user = h.account(this);
  const frame = await openSection(this, section);
  const pref = await preference(frame, label);
  if (pref.missing) throw friendly({ message: `The section "${section}" has no preference "${label}". It has ${h.listed(pref.missing)}.`, hint: 'A preference is named by the label its section shows.' });
  const before = await sectionForm(frame);
  const sectionId = before._section;
  if (user.handle && sectionId) {
    h.afterScenario(this, async () => {
      const session = await h.accountSession(this, user.handle);
      const form = { ...before };
      delete form._token;
      delete form._remote;
      const answer = await session.submit('settings', 'save-prefs', { ...form, _task: 'settings', _action: 'save-prefs', _section: sectionId, _framed: '1' });
      if (answer.status !== 200 || !/successfullysaved|Successfully saved/i.test(answer.text)) throw new Error(`The preferences of "${section}" could not be set back (${answer.status}).`);
    });
  }
  const control = frame.locator(`[name="${pref.name}"]`).first();
  if (pref.kind === 'select') {
    const option = pref.options.find((o) => h.same(o.label, value)) || pref.options.find((o) => h.same(o.value, value));
    if (!option) throw friendly({ message: `The preference "${label}" offers no "${value}". It offers ${h.listed(pref.options.map((o) => o.label))}.`, hint: 'A list\'s option is given by the label it shows.' });
    await control.selectOption(option.value);
  } else if (pref.kind === 'checkbox') {
    if (!/^(on|off)$/i.test(value)) throw friendly({ message: `The preference "${label}" is a switch: it takes "on" or "off", not "${value}".`, hint: 'Write the switch as "on" or "off".' });
    await control.setChecked(/^on$/i.test(value), { force: true });
  } else {
    await control.fill(value);
  }
  await saveFrame(this, frame);
});

/**
 * A preference of a section of Settings > Preferences shows a value: a list's option by its label, a switch "on" or
 * "off", or a text.
 *
 * Example #1: Then the preference "Time format" in "User Interface" should be "07:30 AM"
 * Example #2: Then the preference "Pretty dates" in "User Interface" should be "on"
 * Example #3: And the preference "Date format" in "User Interface" should be "2026-07-24"
 * Example #4: Then the preference "Display next list entry after delete/move" in "User Interface" should be "on"
 * Example #5: Then the preference "Time format" in "User Interface" should be "07:30"
 */
Then(/^the preference "([^"]*)" in "([^"]*)" should be "([^"]*)"$/, async function (label, section, expected) {
  h.account(this);
  const frame = await openSection(this, section);
  const pref = await preference(frame, label);
  if (pref.missing) throw friendly({ message: `The section "${section}" has no preference "${label}". It has ${h.listed(pref.missing)}.`, hint: 'A preference is named by the label its section shows.' });
  if (!h.same(pref.shown, expected)) throw friendly({ message: `The preference "${label}" is "${pref.shown}", not "${expected}".`, hint: 'A list\'s option is read by the label it shows, a switch as "on" or "off".' });
});
