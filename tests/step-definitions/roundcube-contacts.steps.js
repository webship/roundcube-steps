'use strict';

// The address book: the contacts of "Personal Addresses" (added, opened, deleted), and its groups (made, given a
// contact, deleted). What a step makes is taken away when the scenario ends, through the account's own session. A
// scenario deletes what it made: a contact or a group the site had and the scenario deleted is not put back (the
// counts of the pack's CI say so).

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./roundcube-helpers');

/** Be on the address book, on "Personal Addresses" (or a group of it, when one is named). */
async function onContacts(world) {
  h.account(world);
  const page = world.page;
  if (!/^addressbook/.test(await h.screen(page)) || await page.locator('#contacts-table').count() === 0) {
    await h.open(world, h.rcUrl(world, 'addressbook'));
  }
  await page.locator('#contacts-table').waitFor({ state: 'attached', timeout: h.budget(world) });
}

/** The contacts the list shows: [{ id, name }]. */
async function contactRows(page) {
  return page.$$eval('#contacts-table tbody tr', (trs) => trs.filter((tr) => tr.style.display !== 'none' && (tr.offsetWidth || tr.offsetHeight)).map((tr) => ({
    id: tr.id.replace(/^rcmrow/, ''),
    name: tr.textContent.replace(/\s+/g, ' ').trim(),
  })));
}

/** The address books and groups of the list on the left: [{ name, group }]. */
async function books(page) {
  return page.$$eval('#directorylist li', (lis) => lis.map((li) => ({
    name: ((li.querySelector(':scope > a') || li).textContent || '').replace(/\s+/g, ' ').trim(),
    group: li.classList.contains('contactgroup'),
  })));
}

/** Open an address book or a group of the list on the left by its name. */
async function openBook(world, name) {
  const page = world.page;
  const all = await books(page);
  if (!all.some((b) => h.same(b.name, name))) throw friendly({ message: `The address book has no "${name}". It has ${h.listed(all.map((b) => b.name))}.`, hint: 'An address book or a group is named as the list on the left shows it.' });
  await h.act(page, () => page.locator('#directorylist li > a').filter({ hasText: new RegExp(`^\\s*${h.escapeRegExp(name)}\\s*$`, 'i') }).first().click());
}

/** The groups of the account's "Personal Addresses", from its own session: [{ id, name }]. */
async function groupsOf(world, handle) {
  const session = await h.accountSession(world, handle);
  const page = await session.page('addressbook', '');
  const env = (page.text.match(/"contactgroups":(\{[^]*?\}\})/) || [])[1];
  let groups = {};
  try { groups = JSON.parse(env || '{}'); } catch { groups = {}; }
  return Object.values(groups).filter((g) => String(g.source) === '0').map((g) => ({ id: String(g.id), name: g.name }));
}

/**
 * Add a contact to "Personal Addresses" with "Create": a name (its first word is the first name, the rest the last
 * name) and an address. It is deleted when the scenario ends.
 *
 * Example #1: When I add the contact "Webship Tester" with the address "tester@example.com"
 * Example #2: When we add the contact "Dana Test" with the address "dana@example.com"
 * Example #3: And I add the contact "Webship Reviewer" with the address "reviewer@example.com"
 * Example #4: When I add the contact "Erin Test" with the address "erin@example.com"
 * Example #5: When I add the contact "Webship Tester" with the address "tester@example.com"
 *               Then the contact list should show "Webship Tester"
 */
When(/^(?:I|we) add the contact "([^"]*)" with the address "([^"]*)"$/, async function (name, address) {
  const user = h.account(this);
  await onContacts(this);
  const page = this.page;
  const [first, ...rest] = h.clean(name).split(' ');
  if (user.handle) {
    const before = new Set(await h.contactIds(this, user.handle, 0));
    h.afterScenario(this, async () => {
      const added = (await h.contactIds(this, user.handle, 0)).filter((id) => !before.has(id));
      await h.deleteContacts(this, user.handle, 0, added);
    });
  }
  await h.act(page, () => page.locator('#toolbar-menu a.create').click());
  const frame = await h.frameOf(this, 'contact-frame');
  await frame.locator('input[name="_firstname"]').fill(first);
  await frame.locator('input[name="_surname"]').fill(rest.join(' '));
  await frame.locator('input[name="_email[]"]').first().fill(address);
  await h.forgetMessages(page);
  await frame.locator('button.btn.btn-primary.submit').click();
  await h.settle(page, h.budget(this));
  const said = await h.eventually(page, () => h.messages(page), (all) => all.some((m) => m.kind !== 'info'), async (all) => ({
    message: `The webmail did not answer the save of the contact: ${(all || []).length ? `it says ${h.listed(all.map((m) => m.text))}` : await h.pageSummary(this)}.`,
  }), h.budget(this));
  const problem = said.find((m) => m.kind === 'error' || m.kind === 'warning');
  if (problem) throw friendly({ message: `The webmail refused the contact: "${problem.text}".`, hint: 'A contact needs a name or an address the webmail takes.' });
});

/**
 * The contact list (of "Personal Addresses", or of the group that is open) shows a contact by its name, or does not.
 *
 * Example #1: Then the contact list should show "Bob Test"
 * Example #2: Then the contact list should not show "Webship Tester"
 * Example #3: And the contact list should show "Carol Test"
 * Example #4: Then the contact list should show "Webship Tester"
 * Example #5: Then the contact list should not show "Dana Test"
 */
Then(/^the contact list should( not)? show "([^"]*)"$/, async function (not, name) {
  await onContacts(this);
  const page = this.page;
  await h.eventually(page, () => contactRows(page), (all) => all.some((r) => h.same(r.name, name)) === !not, async (all) => ({
    message: not ? `The contact list shows "${name}".` : `The contact list shows no "${name}". It shows ${h.listed((all || []).map((r) => r.name))}.`,
  }), h.budget(this));
});

/**
 * Open a contact of "Personal Addresses" by its name: the right side shows it.
 *
 * Example #1: When I open the contact "Bob Test"
 * Example #2: When we open the contact "Carol Test"
 * Example #3: And I open the contact "Webship Tester"
 * Example #4: When I open the contact "Bob Test"
 * Example #5: When I open the contact "Carol Test"
 *               Then the contact should show "carol@example.com"
 */
When(/^(?:I|we) open the contact "([^"]*)"$/, async function (name) {
  await onContacts(this);
  const page = this.page;
  await openBook(this, 'Personal Addresses');
  const all = await contactRows(page);
  if (!all.some((r) => h.same(r.name, name))) throw friendly({ message: `The contact list shows no "${name}". It shows ${h.listed(all.map((r) => r.name))}.`, hint: 'A contact is named as "Personal Addresses" lists it.' });
  await h.act(page, () => page.locator('#contacts-table tbody tr').filter({ hasText: name }).first().locator('td.name').click());
  const frame = await h.frameOf(this, 'contact-frame');
  await frame.locator('body').waitFor({ state: 'attached', timeout: h.budget(this) });
});

/**
 * The contact open on the right side shows a text: its name, an address, a phone number. The text is what the contact's
 * frame shows, line by line (the tab that is open; "Properties" when a contact opens).
 *
 * Example #1: Then the contact should show "bob@example.com"
 * Example #2: Then the contact should show "Carol Test"
 * Example #3: And the contact should show "tester@example.com"
 * Example #4: Then the contact should show "Bob Test"
 * Example #5: Then the contact should show "carol@example.com"
 */
Then(/^the contact should show "([^"]*)"$/, async function (expected) {
  const frame = await h.frameOf(this, 'contact-frame');
  const shown = () => frame.evaluate(() => (document.body.innerText || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · '));
  await h.eventually(this.page, shown, (text) => h.holds(text, expected), async (text) => ({
    message: `The contact does not show "${expected}". It shows "${h.clean(text || '').slice(0, 240)}".`,
    hint: 'Open a contact first: When I open the contact "…".',
  }), h.budget(this));
});

/**
 * Delete a contact of "Personal Addresses" by its name: select it, "Delete", and confirm. A scenario deletes a contact it
 * added.
 *
 * Example #1: When I delete the contact "Webship Tester"
 * Example #2: When we delete the contact "Dana Test"
 * Example #3: And I delete the contact "Webship Reviewer"
 * Example #4: When I delete the contact "Erin Test"
 * Example #5: When I delete the contact "Webship Tester"
 *               Then the contact list should not show "Webship Tester"
 */
When(/^(?:I|we) delete the contact "([^"]*)"$/, async function (name) {
  await onContacts(this);
  const page = this.page;
  await openBook(this, 'Personal Addresses');
  const all = await contactRows(page);
  if (!all.some((r) => h.same(r.name, name))) throw friendly({ message: `The contact list shows no "${name}". It shows ${h.listed(all.map((r) => r.name))}.`, hint: 'A contact is named as "Personal Addresses" lists it.' });
  await h.act(page, () => page.locator('#contacts-table tbody tr').filter({ hasText: name }).first().locator('td.name').click());
  await page.locator('#toolbar-menu a.delete').click();
  const dialog = page.locator('.ui-dialog:visible');
  await dialog.waitFor({ state: 'visible', timeout: h.budget(this) });
  await h.forgetMessages(page);
  await h.act(page, () => dialog.locator('.ui-dialog-buttonset button.mainaction').click());
  await h.eventually(page, () => contactRows(page), (rows) => !rows.some((r) => h.same(r.name, name)), async () => ({ message: `The contact "${name}" is still listed after "Delete".` }), h.budget(this));
});

/**
 * Make a group of "Personal Addresses" with the address book's menu ("Add group"). It is deleted when the scenario
 * ends.
 *
 * Example #1: When I create the group "Webship test group"
 * Example #2: When we create the group "Webship test team"
 * Example #3: And I create the group "Webship test reviewers"
 * Example #4: When I create the group "Webship test group"
 * Example #5: When I create the group "Webship test group"
 *               Then the address book should list the group "Webship test group"
 */
When(/^(?:I|we) create the group "([^"]*)"$/, async function (name) {
  const user = h.account(this);
  await onContacts(this);
  const page = this.page;
  await openBook(this, 'Personal Addresses');
  if (user.handle) {
    const before = new Set((await groupsOf(this, user.handle)).map((g) => g.id));
    h.afterScenario(this, async () => {
      const session = await h.accountSession(this, user.handle);
      for (const g of await groupsOf(this, user.handle)) {
        if (!before.has(g.id) && h.same(g.name, name)) await session.post('addressbook', 'group-delete', { _source: '0', _gid: g.id });
      }
    });
  }
  await page.locator('#layout-sidebar .header a.sidebar-menu').click();
  const menu = page.locator('#groupoptions-menu');
  await menu.waitFor({ state: 'visible', timeout: h.budget(this) });
  await menu.locator('a', { hasText: 'Add group' }).first().click();
  const dialog = page.locator('.ui-dialog:visible');
  await dialog.waitFor({ state: 'visible', timeout: h.budget(this) });
  await dialog.locator('input[type=text]').first().fill(name);
  await h.act(page, () => dialog.locator('.ui-dialog-buttonset button.mainaction').click());
  await h.eventually(page, () => books(page), (all) => all.some((b) => b.group && h.same(b.name, name)), async (all) => ({ message: `The group "${name}" is not in the address book after "Save". It lists ${h.listed((all || []).map((b) => b.name))}.` }), h.budget(this));
});

/**
 * The address book lists a group by its name, or does not.
 *
 * Example #1: Then the address book should list the group "Webship team"
 * Example #2: Then the address book should not list the group "Webship test group"
 * Example #3: And the address book should list the group "Webship test group"
 * Example #4: Then the address book should list the group "Webship test team"
 * Example #5: Then the address book should not list the group "Webship test reviewers"
 */
Then(/^the address book should( not)? list the group "([^"]*)"$/, async function (not, name) {
  await onContacts(this);
  const page = this.page;
  await h.eventually(page, () => books(page), (all) => all.some((b) => b.group && h.same(b.name, name)) === !not, async (all) => ({
    message: not ? `The address book lists the group "${name}".` : `The address book lists no group "${name}". It lists ${h.listed((all || []).filter((b) => b.group).map((b) => b.name))}.`,
  }), h.budget(this));
});

/**
 * Put a contact of "Personal Addresses" in one of its groups with "More" → "Assign to group...". It leaves the group
 * when the scenario ends.
 *
 * Example #1: When I add the contact "Carol Test" to the group "Webship team"
 * Example #2: When we add the contact "Bob Test" to the group "Webship test group"
 * Example #3: And I add the contact "Webship Tester" to the group "Webship team"
 * Example #4: When I add the contact "Carol Test" to the group "Webship test group"
 * Example #5: When I add the contact "Carol Test" to the group "Webship team"
 *               Then the group "Webship team" should list "Carol Test"
 */
When(/^(?:I|we) add the contact "([^"]*)" to the group "([^"]*)"$/, async function (name, group) {
  const user = h.account(this);
  h.account(this);
  const page = this.page;
  // The address book is read again first: once a group was made on the page, the webmail's group menu offers only
  // the groups made since (they are kept under another kind of source id).
  await h.open(this, h.rcUrl(this, 'addressbook'));
  await page.locator('#contacts-table').waitFor({ state: 'attached', timeout: h.budget(this) });
  await openBook(this, 'Personal Addresses');
  const all = await contactRows(page);
  const row = all.find((r) => h.same(r.name, name));
  if (!row) throw friendly({ message: `"Personal Addresses" shows no contact "${name}". It shows ${h.listed(all.map((r) => r.name))}.`, hint: 'A contact is named as the contact list shows it.' });
  const groups = user.handle ? await groupsOf(this, user.handle) : [];
  const target = groups.find((g) => h.same(g.name, group));
  if (user.handle && !target) throw friendly({ message: `The address book has no group "${group}". It has ${h.listed(groups.map((g) => g.name))}.`, hint: 'A group is made with the address book\'s menu: When I create the group "…".' });
  if (user.handle) {
    h.afterScenario(this, async () => {
      const session = await h.accountSession(this, user.handle);
      await session.post('addressbook', 'group-delmembers', { _source: '0', _gid: target.id, _cid: row.id });
    });
  }
  await h.act(page, () => page.locator('#contacts-table tbody tr').filter({ hasText: name }).first().locator('td.name').click());
  await page.locator('#toolbar-menu a.more').click();
  const more = page.locator('#contact-menu');
  await more.waitFor({ state: 'visible', timeout: h.budget(this) });
  await more.locator('a.assigngroup').click();
  const groupMenu = page.locator('#contactgroup-selector');
  await groupMenu.waitFor({ state: 'visible', timeout: h.budget(this) });
  const item = groupMenu.locator('a', { hasText: group }).first();
  if (await item.count() === 0) throw friendly({ message: `The groups offered are ${h.listed(await groupMenu.locator('a').allTextContents())}, not "${group}".`, hint: 'The menu offers the groups of the address book of the contact.' });
  await h.forgetMessages(page);
  // The webmail places this menu beside "Assign to group..." only once its animation ends; the click goes to the
  // group's entry wherever the menu is.
  await h.act(page, () => item.dispatchEvent('click'));
  await h.expectMessage(this, 'added');
});

/**
 * A group of the address book lists a contact by its name, or does not (the group is opened first).
 *
 * Example #1: Then the group "Webship team" should list "Bob Test"
 * Example #2: Then the group "Webship team" should not list "Carol Test"
 * Example #3: And the group "Webship test group" should list "Bob Test"
 * Example #4: Then the group "Webship team" should list "Carol Test"
 * Example #5: Then the group "Webship test group" should not list "Webship Tester"
 */
Then(/^the group "([^"]*)" should( not)? list "([^"]*)"$/, async function (group, not, name) {
  await onContacts(this);
  const page = this.page;
  await openBook(this, group);
  await h.eventually(page, () => contactRows(page), (all) => all.some((r) => h.same(r.name, name)) === !not, async (all) => ({
    message: not ? `The group "${group}" lists "${name}".` : `The group "${group}" lists no "${name}". It lists ${h.listed((all || []).map((r) => r.name))}.`,
  }), h.budget(this));
});

/**
 * Delete a group of the address book with its menu ("Delete group"), and confirm. A scenario deletes a group it made.
 *
 * Example #1: When I delete the group "Webship test group"
 * Example #2: When we delete the group "Webship test team"
 * Example #3: And I delete the group "Webship test reviewers"
 * Example #4: When I delete the group "Webship test group"
 * Example #5: When I delete the group "Webship test group"
 *               Then the address book should not list the group "Webship test group"
 */
When(/^(?:I|we) delete the group "([^"]*)"$/, async function (name) {
  await onContacts(this);
  const page = this.page;
  await openBook(this, name);
  await page.locator('#layout-sidebar .header a.sidebar-menu').click();
  const menu = page.locator('#groupoptions-menu');
  await menu.waitFor({ state: 'visible', timeout: h.budget(this) });
  await menu.locator('a', { hasText: 'Delete group' }).first().click();
  const dialog = page.locator('.ui-dialog:visible');
  await dialog.waitFor({ state: 'visible', timeout: h.budget(this) });
  await h.act(page, () => dialog.locator('.ui-dialog-buttonset button.mainaction').click());
  await h.eventually(page, () => books(page), (all) => !all.some((b) => b.group && h.same(b.name, name)), async () => ({ message: `The group "${name}" is still listed after "Delete group".` }), h.budget(this));
});
