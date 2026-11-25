'use strict';

// The session: logging in to the webmail as an account of the users registry (or with an address and a password, to
// see a login refused), the account the webmail shows, logging out, and what the webmail says.

const { Given, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const h = require('./roundcube-helpers');

/**
 * Log in to the webmail as an account of the users registry (worldParameters.users in cucumber.js), by its handle: the
 * login form of the front page, then the inbox. A session that is open is logged out first.
 *
 * Example #1: Given I am logged in to the webmail as "alice"
 * Example #2: Given we are logged in to the webmail as "bob"
 * Example #3: When I log in to the webmail as "alice"
 * Example #4: And we log in to the webmail as "bob"
 * Example #5: Given I am logged in to the webmail as "alice"
 *               Then the folder "Inbox" should show 2 unread
 */
Given(/^(?:(?:I am|we are) logged in|(?:I|we) log in) to the webmail as "([^"]*)"$/, async function (handle) {
  await h.logIn(this, handle);
});

/**
 * Log in to the webmail with an address and a password as they are written: for a login that must be refused. A
 * scenario that must log in uses the handle of an account instead, so that no password is written in a feature.
 *
 * Example #1: When I log in to the webmail with the address "alice@example.com" and the password "Not-the-password-1"
 * Example #2: When we log in to the webmail with the address "nobody@example.com" and the password "Not-the-password-1"
 * Example #3: When I log in to the webmail with the address "alice@example.com" and the password ""
 * Example #4: When I log in to the webmail with the address "bob@example.com" and the password "wrong"
 * Example #5: When I log in to the webmail with the address "alice@example.com" and the password "Not-the-password-1"
 *               Then the webmail should refuse the login with "Login failed."
 */
When(/^(?:I|we) log in to the webmail with the address "([^"]*)" and the password "([^"]*)"$/, async function (address, password) {
  const outcome = await h.submitLogin(this, address, password);
  this.__rcLogin = outcome;
  if (outcome.ok) {
    const handle = h.handleOf(this, address);
    this.__rcAccount = handle ? h.resolveUser(this, handle) : { handle: null, username: address, password, email: address, name: '' };
  }
});

/**
 * The login was refused, and the webmail says why. The login form is still there.
 *
 * Example #1: Then the webmail should refuse the login with "Login failed."
 * Example #2: Then the webmail should refuse the login with "Login failed"
 * Example #3: And the webmail should refuse the login with "Login failed."
 * Example #4: Then the webmail should refuse the login with "failed"
 * Example #5: And the webmail should refuse the login with "Login failed."
 */
Then(/^the webmail should refuse the login with "([^"]*)"$/, async function (expected) {
  const outcome = this.__rcLogin;
  if (!outcome) throw friendly({ message: 'No login was tried in this scenario.', hint: 'Try one first: When I log in to the webmail with the address "…" and the password "…".' });
  if (outcome.ok) throw friendly({ message: `The login was not refused: the webmail opened ${h.shown(this.page.url())}.`, hint: 'The address and the password of an account let it in: a refused login needs a wrong password or an address the mail server does not know.' });
  if (!outcome.said.some((s) => h.holds(s, expected))) {
    throw friendly({ message: `The login was refused, but the webmail does not say "${expected}". It says ${h.listed(outcome.said)}.`, hint: 'The webmail says why in the message box under the login form.' });
  }
  if (await this.page.locator('#rcmloginuser').count() === 0) throw friendly({ message: 'The login form is gone after the refused login.', hint: 'A refused login stays on the login page.' });
});

/**
 * The webmail shows the account that is logged in (the address at the top of the menu).
 *
 * Example #1: Then I should be logged in to the webmail as "alice@example.com"
 * Example #2: Then we should be logged in to the webmail as "bob@example.com"
 * Example #3: And I should be logged in to the webmail as "alice@example.com"
 * Example #4: Then I should be logged in to the webmail as "alice"
 * Example #5: Then I should be logged in to the webmail as "bob"
 */
Then(/^(?:I|we) should be logged in to the webmail as "([^"]*)"$/, async function (expected) {
  const page = this.page;
  const read = () => page.evaluate(() => {
    const el = document.querySelector('.header-title.username');
    return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  const wanted = (this.parameters.users || {})[expected] ? h.resolveUser(this, expected).username : expected;
  await h.eventually(page, read, (v) => v !== null && h.same(v, wanted), async (v) => ({
    message: v === null || v === undefined ? `Nobody is logged in to the webmail: ${await h.pageSummary(this)}.` : `The webmail is logged in as "${v}", not "${wanted}".`,
    hint: 'The webmail shows the address of the account at the top of its menu.',
  }), h.budget(this));
});

/**
 * Log out with the menu's "Logout": the webmail ends the session and shows its login form again.
 *
 * Example #1: When I log out of the webmail
 * Example #2: When we log out of the webmail
 * Example #3: And I log out of the webmail
 * Example #4: Then I log out of the webmail
 * Example #5: When I log out of the webmail
 *               Then the webmail should say "You have successfully terminated the session. Goodbye!"
 */
When(/^(?:I|we) log out of the webmail$/, async function () {
  const page = this.page;
  const logout = page.locator('#taskmenu a.logout');
  if (await logout.count() === 0) throw friendly({ message: `The webmail offers no "Logout": ${await h.pageSummary(this)}.`, hint: 'Log in first: Given I am logged in to the webmail as "alice".' });
  await h.forgetMessages(page);
  await h.act(page, () => logout.click());
  await page.locator('#rcmloginuser').waitFor({ state: 'visible', timeout: h.budget(this) }).catch(async () => {
    throw friendly({ message: `The login form did not come back after "Logout": ${await h.pageSummary(this)}.`, hint: 'The webmail ends the session and shows its login form again.' });
  });
  this.__rcAccount = null;
});

/**
 * A message of the webmail: what it answered last (they are kept as they come, so one that is gone is still read).
 *
 * Example #1: Then the webmail should say "Message(s) moved to Trash successfully."
 * Example #2: Then the webmail should say "Message sent successfully."
 * Example #3: Then the webmail should say "Folder created successfully."
 * Example #4: And the webmail should say "Successfully saved."
 * Example #5: Then the webmail should say "You have successfully terminated the session. Goodbye!"
 */
Then(/^the webmail should say "([^"]*)"$/, async function (expected) {
  await h.expectMessage(this, expected);
});
