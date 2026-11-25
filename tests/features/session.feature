@session
Feature: Logging in to the webmail and out of it
  As a person with a mailbox
  I want the webmail to let me in with my address and password, and out again
  So that my mail is mine only

  Scenario: A wrong password is refused
    When I log in to the webmail with the address "alice@example.com" and the password "Not-the-password-1"
    Then the webmail should refuse the login with "Login failed."

  @critical
  Scenario: Alice logs in, and out again
    Given I am logged in to the webmail as "alice"
    Then I should be logged in to the webmail as "alice@example.com"
    When I log out of the webmail
    Then the webmail should say "You have successfully terminated the session. Goodbye!"
