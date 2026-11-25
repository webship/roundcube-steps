@settings
Feature: The identities, the responses and the preferences
  As a person with a mailbox
  I want to write as more than one identity, keep texts I write often, and set the webmail the way I like it
  So that writing mail is quick

  Scenario: An identity is added and deleted
    Given I am logged in to the webmail as "alice"
    Then the identities should list "Alice Test <alice@example.com>"
    When I add the identity "Webship test identity" with the address "alice@example.com"
    Then the identities should list "Webship test identity <alice@example.com>"
    When I delete the identity "Webship test identity"
    Then the identities should not list "Webship test identity"

  Scenario: A response is added and deleted
    Given I am logged in to the webmail as "alice"
    Then the responses should list "Thanks"
    When I add the response "Webship test response" with the text "I will answer tomorrow."
    Then the responses should list "Webship test response"
    When I delete the response "Webship test response"
    Then the responses should not list "Webship test response"

  Scenario: Preferences are set
    Given I am logged in to the webmail as "alice"
    Then the preference "Time format" in "User Interface" should be "07:30"
    When I set the preference "Time format" to "07:30 AM" in "User Interface"
    Then the webmail should say "Successfully saved."
    And the preference "Time format" in "User Interface" should be "07:30 AM"
    When I set the preference "Pretty dates" to "off" in "User Interface"
    Then the preference "Pretty dates" in "User Interface" should be "off"
