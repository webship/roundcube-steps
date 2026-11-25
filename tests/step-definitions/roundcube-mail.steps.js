'use strict';

// The mail: the folders and their unread counts, the message list and its order, a message opened in the preview with
// its sender, its text and its attachments, marking (read, unread, flagged, unflagged), deleting and moving, and
// searching. Every step works in the webmail's own window, the way a person does; what a step changes in a mailbox
// is put back when the scenario ends, through the account's own session.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./roundcube-helpers');

/**
 * Open a folder of the mail by the name the folder list shows.
 *
 * Example #1: When I open the folder "Sent"
 * Example #2: When we open the folder "Inbox"
 * Example #3: And I open the folder "Projects"
 * Example #4: When I open the folder "Trash"
 * Example #5: When I open the folder "Drafts"
 */
When(/^(?:I|we) open the folder "([^"]*)"$/, async function (name) {
  await h.openFolder(this, name);
});

/**
 * The unread count a folder of the folder list shows (none when it shows no count).
 *
 * Example #1: Then the folder "Inbox" should show 2 unread
 * Example #2: Then the folder "Inbox" should show no unread
 * Example #3: And the folder "Projects" should show no unread
 * Example #4: Then the folder "Inbox" should show 3 unread
 * Example #5: Then the folder "Inbox" should show 1 unread
 */
Then(/^the folder "([^"]*)" should show (no|\d+) unread$/, async function (name, count) {
  await h.onMail(this);
  const wanted = count === 'no' ? 0 : Number(count);
  await h.eventually(this.page, () => h.folders(this.page), (all) => all.some((f) => h.same(f.name, name) && f.unread === wanted), async (all) => {
    const folder = (all || []).find((f) => h.same(f.name, name));
    return {
      message: folder ? `The folder "${name}" shows ${folder.unread || 'no'} unread, not ${count}.` : `The webmail has no folder "${name}". It has ${h.listed((all || []).map((f) => f.name))}.`,
      hint: 'The folder list shows the count of unread messages beside a folder\'s name.',
    };
  }, h.budget(this));
});

/**
 * The message list of the open folder shows a message, by its subject, or does not.
 *
 * Example #1: Then the message list should show "Webship weekly report"
 * Example #2: Then the message list should not show "Webship news: November"
 * Example #3: And the message list should show "Notes from the meeting"
 * Example #4: Then the message list should not show "Webship test hello"
 * Example #5: Then the message list should show "Lunch on Friday"
 */
Then(/^the message list should( not)? show "([^"]*)"$/, async function (not, subject) {
  await h.onMail(this);
  const page = this.page;
  await h.eventually(page, () => h.rows(page), (list) => list.some((r) => h.same(r.subject, subject)) === !not, async (list) => ({
    message: not ? `The message list shows "${subject}".` : `The message list shows no "${subject}". It shows ${h.listed((list || []).map((r) => r.subject))}.`,
    hint: `The list shows the folder that is open ("${await h.currentFolder(page)}").`,
  }), h.budget(this));
});

/**
 * The message list shows these messages in this order (others may be between them).
 *
 * Example #1: Then the message list should show "Lunch on Friday", "Webship weekly report" in this order
 * Example #2: Then the message list should show "Webship news: November", "The test plan, attached" in this order
 * Example #3: And the message list should show "Lunch on Friday", "The test plan, attached", "Webship weekly report" in this order
 * Example #4: Then the message list should show "The test plan, attached", "Webship weekly report" in this order
 * Example #5: Then the message list should show "Lunch on Friday", "Webship news: November" in this order
 */
Then(/^the message list should show ((?:"[^"]*", )+"[^"]*") in this order$/, async function (list) {
  await h.onMail(this);
  const wanted = h.quoted(list);
  const page = this.page;
  const inOrder = (all) => {
    let at = -1;
    for (const subject of wanted) {
      const next = all.findIndex((r, i) => i > at && h.same(r.subject, subject));
      if (next < 0) return false;
      at = next;
    }
    return true;
  };
  await h.eventually(page, () => h.rows(page), inOrder, async (all) => ({
    message: `The message list does not show ${h.listed(wanted)} in this order. It shows ${h.listed((all || []).map((r) => r.subject))}.`,
    hint: 'The list is in the order its options sort it (the webmail\'s default: the order the messages arrived in the folder; the test webmail of this pack sorts by date, the newest first).',
  }), h.budget(this));
});

/**
 * A message of the list, by its subject, is read or unread, flagged or not flagged.
 *
 * Example #1: Then the message "Webship weekly report" should be unread
 * Example #2: Then the message "Lunch on Friday" should be flagged
 * Example #3: And the message "Webship news: November" should be read
 * Example #4: Then the message "Webship weekly report" should be not flagged
 * Example #5: Then the message "The test plan, attached" should be read
 */
Then(/^the message "([^"]*)" should be (read|unread|flagged|not flagged)$/, async function (subject, state) {
  await h.onMail(this);
  const page = this.page;
  const check = (r) => (state === 'read' ? !r.unread : state === 'unread' ? r.unread : state === 'flagged' ? r.flagged : !r.flagged);
  await h.eventually(page, () => h.rows(page), (list) => list.some((r) => h.same(r.subject, subject) && check(r)), async (list) => {
    const row = (list || []).find((r) => h.same(r.subject, subject));
    return {
      message: row ? `The message "${subject}" is not ${state}: it is ${row.unread ? 'unread' : 'read'} and ${row.flagged ? 'flagged' : 'not flagged'}.` : `The message list shows no "${subject}". It shows ${h.listed((list || []).map((r) => r.subject))}.`,
      hint: 'Opening a message marks it read.',
    };
  }, h.budget(this));
});

/**
 * Open a message of the list by its subject: the preview shows it (and the webmail marks it read; what it was comes
 * back when the scenario ends).
 *
 * Example #1: When I open the message "The test plan, attached"
 * Example #2: When we open the message "Webship weekly report"
 * Example #3: And I open the message "Lunch on Friday"
 * Example #4: When I open the message "Notes from the meeting"
 * Example #5: When I open the message "Webship news: November"
 */
When(/^(?:I|we) open the message "([^"]*)"$/, async function (subject) {
  await h.onMail(this);
  await h.selectMessage(this, subject);
  const frame = await h.frameOf(this, 'messagecontframe');
  await frame.waitForSelector('#messagebody, #message-header', { timeout: h.budget(this) }).catch(async () => {
    throw friendly({ message: `The message "${subject}" did not open in the preview: ${await h.pageSummary(this)}.`, hint: 'The webmail shows a message on the right of the list once a click selects it.' });
  });
  this.__rcSubject = subject;
});

/** The message the preview shows: { subject, from, to, text, attachments } */
async function preview(world) {
  const frame = await h.frameOf(world, 'messagecontframe');
  return frame.evaluate(() => {
    const text = (sel) => ((document.querySelector(sel) || {}).textContent || '').replace(/\s+/g, ' ').trim();
    const subject = document.querySelector('#message-header h2.subject');
    return {
      subject: subject ? [...subject.childNodes].filter((n) => n.nodeType === 3 || (n.classList && !n.classList.contains('voice') && !n.classList.contains('extwin'))).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim() : '',
      from: text('#message-header td.header.from'),
      to: text('#message-header td.header.to'),
      cc: text('#message-header td.header.cc'),
      text: text('#messagebody'),
      attachments: [...document.querySelectorAll('#attachment-list li .attachment-name')].map((a) => a.textContent.trim()),
    };
  });
}

/**
 * The message open in the preview: its sender, its recipients, its subject, or a text of its body.
 *
 * Example #1: Then the message should be from "Bob Test"
 * Example #2: Then the message should be to "Alice Test"
 * Example #3: Then the message should have the subject "The test plan, attached"
 * Example #4: Then the message should say "twelve scenarios passed"
 * Example #5: And the message should be from "Webship Newsletter"
 */
Then(/^the message should (be from|be to|have the subject|say) "([^"]*)"$/, async function (what, expected) {
  const field = { 'be from': 'from', 'be to': 'to', 'have the subject': 'subject', say: 'text' }[what];
  const page = this.page;
  await h.eventually(page, () => preview(this), (m) => (field === 'subject' ? h.same(m.subject, expected) : h.holds(m[field], expected)), async (m) => ({
    message: m ? `The message does not ${{ 'be from': 'come from', 'be to': 'go to', 'have the subject': 'have the subject', say: 'say' }[what]} "${expected}": its ${field === 'text' ? 'text reads' : `${field} is`} "${(m[field] || '').slice(0, 200)}".` : `No message is open in the preview: ${await h.pageSummary(this)}.`,
    hint: 'Open a message first: When I open the message "…".',
  }), h.budget(this));
});

/**
 * The attachments of the message open in the preview, by their file names.
 *
 * Example #1: Then the message should list the attachment "test-plan.txt"
 * Example #2: Then the message should not list the attachment "test-plan.txt"
 * Example #3: And the message should list the attachment "test-plan.txt"
 * Example #4: Then the message should not list the attachment "report.pdf"
 * Example #5: Then the message should list the attachment "test-plan.txt"
 */
Then(/^the message should( not)? list the attachment "([^"]*)"$/, async function (not, name) {
  await h.eventually(this.page, () => preview(this), (m) => m.attachments.some((a) => h.same(a, name)) === !not, async (m) => ({
    message: not ? `The message lists the attachment "${name}".` : `The message lists no attachment "${name}". It lists ${h.listed((m && m.attachments) || [])}.`,
    hint: 'The attachments of a message are listed under its text.',
  }), h.budget(this));
});

/**
 * Mark a message of the list with the toolbar's "Mark": read, unread, flagged or unflagged. The message is selected
 * first (which marks it read); what it was comes back when the scenario ends.
 *
 * Example #1: When I mark the message "Webship weekly report" as flagged
 * Example #2: When I mark the message "The test plan, attached" as unread
 * Example #3: When we mark the message "Lunch on Friday" as unflagged
 * Example #4: And I mark the message "Webship weekly report" as read
 * Example #5: When I mark the message "Webship news: November" as unread
 */
When(/^(?:I|we) mark the message "([^"]*)" as (read|unread|flagged|unflagged)$/, async function (subject, flag) {
  await h.onMail(this);
  const page = this.page;
  await h.selectMessage(this, subject);
  const menu = page.locator('#markmessage-menu');
  if (!(await menu.isVisible())) await page.locator('#toolbar-menu a.markmessage').click();
  await menu.waitFor({ state: 'visible', timeout: h.budget(this) });
  const item = { read: 'read', unread: 'unread', flagged: 'flag', unflagged: 'unflag' }[flag];
  await h.act(page, () => menu.locator(`a.${item}`).click());
  const check = (r) => (flag === 'read' ? !r.unread : flag === 'unread' ? r.unread : flag === 'flagged' ? r.flagged : !r.flagged);
  await h.eventually(page, () => h.rows(page), (list) => list.some((r) => h.same(r.subject, subject) && check(r)), async () => ({ message: `The message "${subject}" was not marked ${flag}.` }), h.budget(this));
});

/**
 * Delete a message of the list with the toolbar's "Delete": the webmail moves it to the trash. It comes back to its
 * folder when the scenario ends.
 *
 * Example #1: When I delete the message "Webship news: November"
 * Example #2: When we delete the message "Lunch on Friday"
 * Example #3: And I delete the message "Webship weekly report"
 * Example #4: When I delete the message "The test plan, attached"
 * Example #5: When I delete the message "Notes from the meeting"
 */
When(/^(?:I|we) delete the message "([^"]*)"$/, async function (subject) {
  await h.onMail(this);
  const page = this.page;
  const user = h.account(this);
  const trash = (this.parameters.mail && this.parameters.mail.trash) || 'Trash';
  const { folder } = await h.selectMessage(this, subject);
  if (folder !== trash && user.handle) {
    const since = await h.lastUid(this, user.handle, trash);
    h.afterScenario(this, async () => {
      const back = (await h.folderMessages(this, user.handle, trash)).filter((m) => m.uid > since && h.same(m.subject, subject)).map((m) => m.uid);
      await h.moveMessages(this, user.handle, trash, back, folder);
    });
  }
  await h.forgetMessages(page);
  await h.act(page, () => page.locator('#toolbar-menu a.delete').click());
  await h.eventually(page, () => h.rows(page), (list) => !list.some((r) => h.same(r.subject, subject)), async () => ({ message: `The message "${subject}" is still in the list after "Delete": ${await h.pageSummary(this)}.` }), h.budget(this));
});

/**
 * Move a message of the list to another folder with "More" → "Move to...". It comes back to its folder when the
 * scenario ends.
 *
 * Example #1: When I move the message "Webship weekly report" to the folder "Projects"
 * Example #2: When we move the message "Lunch on Friday" to the folder "Projects"
 * Example #3: And I move the message "Webship project plan" to the folder "Inbox"
 * Example #4: When I move the message "The test plan, attached" to the folder "Junk"
 * Example #5: When I move the message "Webship news: November" to the folder "Projects"
 */
When(/^(?:I|we) move the message "([^"]*)" to the folder "([^"]*)"$/, async function (subject, target) {
  await h.onMail(this);
  const page = this.page;
  const user = h.account(this);
  const all = await h.folders(page);
  const to = all.find((f) => h.same(f.name, target)) || all.find((f) => h.same(f.path, target));
  if (!to) throw friendly({ message: `The webmail has no folder "${target}". It has ${h.listed(all.map((f) => f.name))}.`, hint: 'A folder is named as the folder list shows it; a folder of its own is made in Settings > Folders.' });
  const { folder } = await h.selectMessage(this, subject);
  if (user.handle) {
    const since = await h.lastUid(this, user.handle, to.path);
    h.afterScenario(this, async () => {
      const back = (await h.folderMessages(this, user.handle, to.path)).filter((m) => m.uid > since && h.same(m.subject, subject)).map((m) => m.uid);
      await h.moveMessages(this, user.handle, to.path, back, folder);
    });
  }
  await page.locator('#toolbar-menu a.more').click();
  await page.locator('#message-menu').waitFor({ state: 'visible', timeout: h.budget(this) });
  await page.locator('#message-menu a.move').click();
  const selector = page.locator('#folder-selector');
  await selector.waitFor({ state: 'visible', timeout: h.budget(this) });
  await h.forgetMessages(page);
  await h.act(page, () => selector.locator('a', { hasText: to.name }).first().click());
  await h.eventually(page, () => h.rows(page), (list) => !list.some((r) => h.same(r.subject, subject)), async () => ({ message: `The message "${subject}" is still in the list after the move: ${await h.pageSummary(this)}.` }), h.budget(this));
});

/**
 * Search the open folder with the search box of the list: the list shows what it found.
 *
 * Example #1: When I search the mail for "report"
 * Example #2: When we search the mail for "Lunch"
 * Example #3: And I search the mail for "test plan"
 * Example #4: When I search the mail for "Webship"
 * Example #5: When I search the mail for "nothing like this"
 */
When(/^(?:I|we) search the mail for "([^"]*)"$/, async function (text) {
  await h.onMail(this);
  const page = this.page;
  const box = page.locator('#mailsearchform');
  await box.fill(text);
  await h.act(page, () => box.press('Enter'));
  await page.waitForFunction(() => /Search result|Search results/i.test(document.title) || !!document.querySelector('#messagelist tbody tr'), null, { timeout: h.budget(this) }).catch(() => {});
});
