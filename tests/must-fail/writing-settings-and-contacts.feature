@must-fail
Feature: Assertions of writing mail, the settings and the address book that must fail
  Each scenario asserts something that is not true on the test webmail: its last step must fail with the message its
  description announces, and a hint. What a scenario changes goes back when it ends; tests/check-must-fail.js runs
  them.

  Scenario: Another subject of a reply
    Fails with: The subject is "Re: Webship weekly report", not "Webship weekly report".
    Given I am logged in to the webmail as "alice"
    When I reply to the message "Webship weekly report"
    Then the subject should be "Webship weekly report"

  Scenario: A recipient the message does not go to
    Fails with: The message does not go to "carol@example.com".
    Given I am logged in to the webmail as "alice"
    When I start a new message
    And I write to "bob"
    Then the message should go to "carol@example.com"

  Scenario: A text the message does not hold
    Fails with: The text does not contain "Goodbye".
    Given I am logged in to the webmail as "alice"
    When I start a new message
    And I write the text "Hello"
    Then the text should contain "Goodbye"

  Scenario: A response the webmail does not have
    Fails with: The responses menu offers no "Webship test nothing".
    Given I am logged in to the webmail as "alice"
    When I start a new message
    And I insert the response "Webship test nothing"

  Scenario: A folder the list does not show
    Fails with: The folder list shows no "Webship test nothing".
    Given I am logged in to the webmail as "alice"
    Then the folder list should show "Webship test nothing"

  Scenario: A folder the list shows
    Fails with: The folder list shows "Projects".
    Given I am logged in to the webmail as "alice"
    Then the folder list should not show "Projects"

  Scenario: An identity the settings do not list
    Fails with: The identities list no "Webship test nothing".
    Given I am logged in to the webmail as "alice"
    Then the identities should list "Webship test nothing"

  Scenario: A response the settings do not list
    Fails with: The responses list no "Webship test nothing".
    Given I am logged in to the webmail as "alice"
    Then the responses should list "Webship test nothing"

  Scenario: Another value of a preference
    Fails with: The preference "Time format" is "07:30", not "7:30 am".
    Given I am logged in to the webmail as "alice"
    Then the preference "Time format" in "User Interface" should be "7:30 am"

  Scenario: A preference a section does not have
    Fails with: The section "User Interface" has no preference "Webship test nothing".
    Given I am logged in to the webmail as "alice"
    When I set the preference "Webship test nothing" to "on" in "User Interface"

  Scenario: A contact the list does not show
    Fails with: The contact list shows no "Webship test nothing".
    Given I am logged in to the webmail as "alice"
    Then the contact list should show "Webship test nothing"

  Scenario: A contact the list shows
    Fails with: The contact list shows "Bob Test".
    Given I am logged in to the webmail as "alice"
    Then the contact list should not show "Bob Test"

  Scenario: Another address of a contact
    Fails with: The contact does not show "bob@example.com".
    Given I am logged in to the webmail as "alice"
    When I open the contact "Carol Test"
    Then the contact should show "bob@example.com"

  Scenario: A group the address book does not have
    Fails with: The address book lists no group "Webship test nothing".
    Given I am logged in to the webmail as "alice"
    Then the address book should list the group "Webship test nothing"

  Scenario: A contact the group does not hold
    Fails with: The group "Webship team" lists no "Carol Test".
    Given I am logged in to the webmail as "alice"
    Then the group "Webship team" should list "Carol Test"
