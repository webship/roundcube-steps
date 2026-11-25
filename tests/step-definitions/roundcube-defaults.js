'use strict';

// The pack's hooks. It registers no step.
//
//   1. Before each scenario: the list of what the scenario will ask to be put back, and the recorder of the webmail's
//      messages on the scenario's page.
//   2. After each scenario, whatever its outcome: those restores, newest first. One that fails is reported, and the
//      others still run. They go through the accounts' own sessions, so they work whatever the scenario's browser did.
//   3. After the run: the accounts' sessions are closed.

const { Before, After, AfterAll } = require('@cucumber/cucumber');
const h = require('./roundcube-helpers');

Before(async function () {
  this.mailCleanup = [];
  this.__rcAccount = null;
  if (this.page) await h.recordMessages(this.page);
});

After({ timeout: 240000 }, async function () {
  const jobs = (this.mailCleanup || []).slice().reverse();
  this.mailCleanup = [];
  const failures = [];
  for (const job of jobs) {
    try {
      await job();
    } catch (err) {
      failures.push(err && err.message ? err.message : String(err));
    }
  }
  if (failures.length) {
    // eslint-disable-next-line no-console
    console.warn(`What the scenario changed was not all put back: ${failures.join(' | ')}`);
  }
});

AfterAll(async function () {
  await h.sessionsEnd();
});
