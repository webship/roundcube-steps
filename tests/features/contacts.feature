@contacts
Feature: The address book
  As a person with a mailbox
  I want to keep the people I write to, and groups of them
  So that I find their addresses

  Scenario: The address book lists the contacts and their group
    Given I am logged in to the webmail as "alice"
    Then the contact list should show "Bob Test"
    And the contact list should show "Carol Test"
    When I open the contact "Carol Test"
    Then the contact should show "carol@example.com"
    And the address book should list the group "Webship team"
    And the group "Webship team" should list "Bob Test"
    And the group "Webship team" should not list "Carol Test"

  Scenario: A contact is added and deleted
    Given I am logged in to the webmail as "alice"
    When I add the contact "Webship Tester" with the address "tester@example.com"
    Then the webmail should say "Successfully saved."
    And the contact list should show "Webship Tester"
    When I delete the contact "Webship Tester"
    Then the contact list should not show "Webship Tester"

  Scenario: A group is made, given a contact, and deleted
    Given I am logged in to the webmail as "alice"
    When I create the group "Webship test group"
    Then the address book should list the group "Webship test group"
    When I add the contact "Carol Test" to the group "Webship test group"
    Then the group "Webship test group" should list "Carol Test"
    When I delete the group "Webship test group"
    Then the address book should not list the group "Webship test group"
