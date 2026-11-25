@must-fail
Feature: Assertions of the session and the mail that must fail
  Each scenario asserts something that is not true on the test webmail: its last step must fail with the message its
  description announces, and a hint. What a scenario changes goes back when it ends; tests/check-must-fail.js runs
  them.

  Scenario: A refused login said to be open
    Fails with: Nobody is logged in to the webmail
    When I log in to the webmail with the address "alice@example.com" and the password "Not-the-password-1"
    Then I should be logged in to the webmail as "alice@example.com"

  Scenario: A refused login said to be refused with other words
    Fails with: The login was refused, but the webmail does not say "Wrong password".
    When I log in to the webmail with the address "alice@example.com" and the password "Not-the-password-1"
    Then the webmail should refuse the login with "Wrong password"

  Scenario: Another account
    Fails with: The webmail is logged in as "alice@example.com", not "bob@example.com".
    Given I am logged in to the webmail as "alice"
    Then I should be logged in to the webmail as "bob@example.com"

  Scenario: A message the webmail does not give
    Fails with: The webmail does not say "Webship test nothing".
    Given I am logged in to the webmail as "alice"
    Then the webmail should say "Webship test nothing"

  Scenario: A folder the webmail does not have
    Fails with: The webmail has no folder "Webship test nothing".
    Given I am logged in to the webmail as "alice"
    When I open the folder "Webship test nothing"

  Scenario: Another unread count
    Fails with: The folder "Inbox" shows 2 unread, not 5.
    Given I am logged in to the webmail as "alice"
    Then the folder "Inbox" should show 5 unread

  Scenario: A message the list does not show
    Fails with: The message list shows no "Webship test nothing".
    Given I am logged in to the webmail as "alice"
    Then the message list should show "Webship test nothing"

  Scenario: A message the list shows
    Fails with: The message list shows "Lunch on Friday".
    Given I am logged in to the webmail as "alice"
    Then the message list should not show "Lunch on Friday"

  Scenario: The messages in another order
    Fails with: The message list does not show "Webship weekly report", "Lunch on Friday" in this order.
    Given I am logged in to the webmail as "alice"
    Then the message list should show "Webship weekly report", "Lunch on Friday" in this order

  Scenario: A read message said to be unread
    Fails with: The message "Lunch on Friday" is not unread: it is read and flagged.
    Given I am logged in to the webmail as "alice"
    Then the message "Lunch on Friday" should be unread

  Scenario: A message the list cannot open
    Fails with: The message list shows no "Webship test nothing".
    Given I am logged in to the webmail as "alice"
    When I open the message "Webship test nothing"

  Scenario: Another sender
    Fails with: The message does not come from "Carol Test": its from is "Bob Test".
    Given I am logged in to the webmail as "alice"
    When I open the message "The test plan, attached"
    Then the message should be from "Carol Test"

  Scenario: An attachment the message does not have
    Fails with: The message lists no attachment "report.pdf".
    Given I am logged in to the webmail as "alice"
    When I open the message "The test plan, attached"
    Then the message should list the attachment "report.pdf"
