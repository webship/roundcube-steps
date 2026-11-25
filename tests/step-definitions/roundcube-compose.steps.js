'use strict';

// Writing mail: a new message, a reply and a forward of a message of the list, its recipients, subject and text, a
// response inserted, the message sent or saved as a draft, or discarded. A message the scenario sent is taken away
// when the scenario ends: its copy in the sender's sent folder and the copy each account of the users registry got
// in its inbox (deleted for good), with the addresses the sending collected; a draft it saved, the same way.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./roundcube-helpers');

/** The compose screen's recipients of a field (to, cc, bcc), its subject and its text. */
async function draft(page) {
  return page.evaluate(() => {
    const tokens = (name) => {
      const field = document.querySelector(`#_${name}`);
      const box = field ? field.closest('.input-group, td, .form-group') : null;
      const widget = box ? box.querySelector('.recipient-input') : null;
      return widget ? [...widget.querySelectorAll('.recipient')].map((r) => r.textContent.replace(/[,;]\s*$/, '').replace(/\s+/g, ' ').trim()) : [];
    };
    return {
      to: tokens('to'),
      cc: tokens('cc'),
      subject: (document.querySelector('#compose-subject') || {}).value || '',
      text: (document.querySelector('#composebody') || {}).value || '',
    };
  });
}

/** Be on the compose screen, or a failure that says to start a message first. */
async function onCompose(world) {
  const page = world.page;
  if (await page.locator('#compose-subject').count() === 0) {
    throw friendly({ message: `No message is being written: ${await h.pageSummary(world)}.`, hint: 'Start one first: When I start a new message.' });
  }
}

/** Wait for the compose screen of a new message, a reply or a forward. */
async function composeOpened(world) {
  await world.page.locator('#compose-subject').waitFor({ state: 'visible', timeout: h.budget(world) }).catch(async () => {
    throw friendly({ message: `The compose screen did not open: ${await h.pageSummary(world)}.`, hint: 'The menu\'s "Compose", or Reply and Forward of a message, open it.' });
  });
  await h.settle(world.page, h.budget(world));
}

/**
 * Before a message is sent or saved: note the last message of each folder it will land in (the sender's sent folder or
 * drafts, each account of the registry it goes to), so that the scenario's end takes away the copies that came after.
 */
async function takeAwayLater(world, subject, folders) {
  const notes = [];
  for (const [handle, folder] of folders) notes.push([handle, folder, await h.lastUid(world, handle, folder)]);
  h.afterScenario(world, async () => {
    const problems = [];
    for (const [handle, folder, since] of notes) {
      try {
        const uids = (await h.folderMessages(world, handle, folder)).filter((m) => m.uid > since && h.same(m.subject, subject)).map((m) => m.uid);
        await h.deleteForGood(world, handle, folder, uids);
      } catch (err) {
        problems.push(err.message);
      }
    }
    if (problems.length) throw new Error(problems.join('; '));
  });
}

/**
 * Start a new message with the menu's "Compose".
 *
 * Example #1: When I start a new message
 * Example #2: When we start a new message
 * Example #3: And I start a new message
 * Example #4: Given I start a new message
 * Example #5: When I start a new message
 *               And I write to "bob@example.com"
 */
When(/^(?:I|we) start a new message$/, async function () {
  h.account(this);
  const page = this.page;
  const compose = page.locator('#taskmenu a.compose');
  if (await compose.count() === 0) await h.open(this, h.rcUrl(this, 'mail'));
  await h.act(page, () => page.locator('#taskmenu a.compose').click());
  await composeOpened(this);
});

/**
 * Reply to, reply to all of, or forward a message of the list, by its subject, with the toolbar: the compose screen
 * opens with the recipients, the subject and the text the webmail fills in. (The message is selected first, which
 * marks it read; what it was comes back when the scenario ends.)
 *
 * Example #1: When I reply to the message "Webship weekly report"
 * Example #2: When I reply to all of the message "Webship weekly report"
 * Example #3: When I forward the message "The test plan, attached"
 * Example #4: When we reply to the message "Lunch on Friday"
 * Example #5: When I forward the message "Webship news: November"
 */
When(/^(?:I|we) (reply to|reply to all of|forward) the message "([^"]*)"$/, async function (how, subject) {
  const page = this.page;
  await h.onMail(this);
  await h.selectMessage(this, subject);
  const button = { 'reply to': 'a.reply', 'reply to all of': 'a.reply-all', forward: 'a.forward' }[how];
  await h.act(page, () => page.locator(`#toolbar-menu ${button}`).click());
  await composeOpened(this);
});

/**
 * Add a recipient to the message being written, in its "To" field (or "Cc" / "Bcc", which the field menu adds first):
 * an address, or an account of the users registry by its handle.
 *
 * Example #1: When I write to "bob@example.com"
 * Example #2: When I write to "bob"
 * Example #3: When I add "alice@example.com" as Cc
 * Example #4: And we write to "Bob Test <bob@example.com>"
 * Example #5: When I add "bob@example.com" as Bcc
 */
When(/^(?:I|we) (?:write to "([^"]*)"|add "([^"]*)" as (Cc|Bcc))$/, async function (to, other, kind) {
  await onCompose(this);
  const page = this.page;
  const value = to || other;
  const field = (kind || 'To').toLowerCase();
  const users = this.parameters.users || {};
  const address = users[value] ? h.resolveUser(this, value).email : value;
  // A Cc or Bcc field is hidden until the field menu ("Add field (Cc, Bcc, ...)") adds it.
  if (field !== 'to' && !(await page.locator(`#compose_${field}`).isVisible().catch(() => false))) {
    await page.locator('a[data-popup="headers-menu"]').first().click();
    await page.locator('#headers-menu').waitFor({ state: 'visible', timeout: h.budget(this) });
    await page.locator('#headers-menu a', { hasText: kind }).first().click();
    await page.locator(`#compose_${field}`).waitFor({ state: 'visible', timeout: h.budget(this) });
  }
  // The field is a list of recipients with an input at its end; Enter makes what was typed a recipient.
  const widget = page.locator(`#_${field}`).locator('xpath=..').locator('.recipient-input input').first();
  await widget.click();
  await widget.fill(address);
  await widget.press('Enter');
  await h.eventually(page, () => draft(page), (d) => d[field].some((r) => h.holds(r, address.replace(/^.*<|>$/g, ''))), async (d) => ({
    message: `"${address}" is not among the recipients (${kind || 'To'}). They are ${h.listed((d && d[field]) || [])}.`,
  }), h.budget(this));
});

/**
 * Set the subject of the message being written.
 *
 * Example #1: When I set the subject to "Webship test hello"
 * Example #2: When we set the subject to "Webship test plan"
 * Example #3: And I set the subject to "Webship test report"
 * Example #4: When I set the subject to "Webship test draft"
 * Example #5: When I set the subject to "Webship test question"
 */
When(/^(?:I|we) set the subject to "([^"]*)"$/, async function (subject) {
  await onCompose(this);
  await this.page.locator('#compose-subject').fill(subject);
});

/**
 * Write the text of the message being written (it replaces what the text holds).
 *
 * Example #1: When I write the text "A test mail from the scenario."
 * Example #2: When we write the text "See you on Friday."
 * Example #3: And I write the text "The report is attached."
 * Example #4: When I write the text "Hello Bob"
 * Example #5: When I write the text "Thank you."
 */
When(/^(?:I|we) write the text "([^"]*)"$/, async function (text) {
  await onCompose(this);
  await this.page.locator('#composebody').fill(text);
});

/**
 * Insert a response (a saved text of Settings > Responses) into the message being written, with the toolbar's
 * "Insert a response".
 *
 * Example #1: When I insert the response "Thanks"
 * Example #2: When we insert the response "Thanks"
 * Example #3: And I insert the response "Thanks"
 * Example #4: When I insert the response "Webship test response"
 * Example #5: When I insert the response "Thanks"
 */
When(/^(?:I|we) insert the response "([^"]*)"$/, async function (name) {
  await onCompose(this);
  const page = this.page;
  await page.locator('#toolbar-menu a.responses').click();
  const menu = page.locator('#responses-menu');
  await menu.waitFor({ state: 'visible', timeout: h.budget(this) });
  const items = await menu.locator('a').allTextContents();
  const item = menu.locator('a', { hasText: name }).first();
  if (await item.count() === 0) throw friendly({ message: `The responses menu offers no "${name}". It offers ${h.listed(items)}.`, hint: 'A response is added in Settings > Responses.' });
  const before = (await draft(page)).text;
  await h.act(page, () => item.click());
  await h.eventually(page, () => draft(page), (d) => d.text !== before, async () => ({ message: `The response "${name}" was not inserted into the text.` }), h.budget(this));
});

/**
 * The message being written: who it goes to (in its "To" field), its subject, or a text it holds.
 *
 * Example #1: Then the message should go to "Bob Test"
 * Example #2: Then the subject should be "Re: Webship weekly report"
 * Example #3: Then the text should contain "Bob Test wrote:"
 * Example #4: And the message should go to "bob@example.com"
 * Example #5: Then the text should contain "Thank you, I will look at it today."
 */
Then(/^the (message should go to|subject should be|text should contain) "([^"]*)"$/, async function (what, expected) {
  await onCompose(this);
  const page = this.page;
  const check = {
    'message should go to': (d) => d.to.some((r) => h.holds(r, expected)),
    'subject should be': (d) => h.same(d.subject, expected),
    'text should contain': (d) => h.holds(d.text, expected),
  }[what];
  await h.eventually(page, () => draft(page), check, async (d) => ({
    message: {
      'message should go to': `The message does not go to "${expected}". It goes to ${h.listed((d && d.to) || [])}.`,
      'subject should be': `The subject is "${(d && d.subject) || ''}", not "${expected}".`,
      'text should contain': `The text does not contain "${expected}". It reads "${clip((d && d.text) || '')}".`,
    }[what],
  }), h.budget(this));
});

function clip(text) {
  const t = h.clean(text);
  return t.length > 200 ? `${t.slice(0, 200)}…` : t;
}

/**
 * Send the message being written with "Send": the webmail sends it and goes back to the mail. The copy in the sender's
 * sent folder, and the copy an account of the users registry got in its inbox, are taken away when the scenario ends.
 *
 * Example #1: When I send the message
 * Example #2: When we send the message
 * Example #3: And I send the message
 * Example #4: Then I send the message
 * Example #5: When I send the message
 *               Then the webmail should say "Message sent successfully."
 */
When(/^(?:I|we) send the message$/, async function () {
  await onCompose(this);
  const page = this.page;
  const user = h.account(this);
  const d = await draft(page);
  const mail = this.parameters.mail || {};
  const folders = [];
  if (user.handle) folders.push([user.handle, mail.sent || 'Sent']);
  for (const r of [...d.to, ...d.cc]) {
    const address = (r.match(/<([^>]+)>/) || [null, r])[1];
    const handle = h.handleOf(this, h.clean(address));
    if (handle && !folders.some(([hh, f]) => hh === handle && f === 'INBOX')) folders.push([handle, 'INBOX']);
  }
  await takeAwayLater(this, d.subject, folders);
  // The addresses it collects for the sender (the ones its address book does not hold) go when the scenario ends.
  if (user.handle) await h.keepCollected(this, user.handle);
  await h.forgetMessages(page);
  await h.act(page, () => page.locator('button.btn.btn-primary.send, #toolbar-menu a.send').first().click());
  await h.eventually(page, async () => ({ said: await h.messages(page), compose: await page.locator('#compose-subject').count() }), (v) => v.compose === 0 || v.said.some((m) => m.kind === 'error' || m.kind === 'warning'), async (v) => ({
    message: `The message was not sent: ${v && v.said.length ? `the webmail says ${h.listed(v.said.map((m) => m.text))}` : await h.pageSummary(this)}.`,
  }), h.budget(this) * 2);
  const said = await h.messages(page);
  const refused = said.find((m) => m.kind === 'error' || m.kind === 'warning');
  if (refused && await page.locator('#compose-subject').count()) throw friendly({ message: `The message was not sent: the webmail says "${refused.text}".`, hint: 'A message needs a recipient the mail server takes.' });
});

/**
 * Save the message being written as a draft with "Save as draft"; the draft is taken away when the scenario ends.
 *
 * Example #1: When I save the message as a draft
 * Example #2: When we save the message as a draft
 * Example #3: And I save the message as a draft
 * Example #4: Then I save the message as a draft
 * Example #5: When I save the message as a draft
 *               Then the webmail should say "Message saved to Drafts."
 */
When(/^(?:I|we) save the message as a draft$/, async function () {
  await onCompose(this);
  const page = this.page;
  const user = h.account(this);
  const d = await draft(page);
  if (user.handle) await takeAwayLater(this, d.subject, [[user.handle, (this.parameters.mail && this.parameters.mail.drafts) || 'Drafts']]);
  await h.forgetMessages(page);
  await h.act(page, () => page.locator('#toolbar-menu a.save.draft').click());
  await h.expectMessage(this, 'saved');
});

/**
 * Leave the message being written without sending it: the menu's "Mail", then "Discard" in the webmail's question.
 *
 * Example #1: When I discard the message
 * Example #2: When we discard the message
 * Example #3: And I discard the message
 * Example #4: Then I discard the message
 * Example #5: When I discard the message
 *               Then the message list should not show "Webship test draft"
 */
When(/^(?:I|we) discard the message$/, async function () {
  await onCompose(this);
  const page = this.page;
  await page.locator('#taskmenu a.mail').click();
  const discard = page.locator('.ui-dialog .ui-dialog-buttonset button.discard');
  if (await discard.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
    await h.act(page, () => discard.click());
  }
  await page.locator('#messagelist').waitFor({ state: 'attached', timeout: h.budget(this) }).catch(async () => {
    throw friendly({ message: `The mail did not come back after the message was discarded: ${await h.pageSummary(this)}.`, hint: 'The webmail asks whether to discard a message with changes; "Discard" leaves it.' });
  });
  await h.settle(page, h.budget(this));
});
