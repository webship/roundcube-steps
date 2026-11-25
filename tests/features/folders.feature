@settings @folders
Feature: The folders
  As a person with a mailbox
  I want folders of my own
  So that I can file my mail

  Scenario: A folder is made, given a folder of its own, and that one deleted
    Given I am logged in to the webmail as "alice"
    When I create the folder "Webship test folder"
    Then the webmail should say "Folder created successfully."
    And the folder list should show "Webship test folder"
    When I create the folder "Webship test archive" in "Webship test folder"
    And I delete the folder "Webship test archive"
    Then the folder list should not show "Webship test archive"

  Scenario: A folder is renamed
    Given I am logged in to the webmail as "alice"
    When I rename the folder "Projects" to "Webship test projects"
    Then the folder list should show "Webship test projects"
    And the folder list should not show "Projects"
