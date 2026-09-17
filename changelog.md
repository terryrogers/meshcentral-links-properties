# Changelog

## 3.8.3 - 2026-08-30

- Render read-only Information values as plain text instead of disabled text boxes.
- Remove the redundant Calculated value helper text.
- Use a compact, borderless two-column layout and apply configured label and value colours, backgrounds, bold, italic and underline styles directly.

## 3.8.2 - 2026-08-30

- Show the dedicated Information and Properties tabs only when at least one applicable field exists for that device.
- Re-request and re-render the separate Quick Commands plugin panel after device-page refreshes without replacing its configuration or commands.

## 3.8.1 - 2026-08-30

- Fixed visibility Tag and other dynamically generated selectors so the chosen value remains displayed after selection.
- Added matching validation and input-mask preset catalogues loaded from persistent `data/property-presets.json`.
- Automatically creates the editable persistent preset file from a packaged default without overwriting later local changes.
- Added Input Mask Preset selection and retained independent custom mask fields.
- Removed the unsupported Required property option, persistence, schema marking, device-page asterisk and save-time enforcement.
- Added regression coverage for Semantic selection resynchronisation, persistent presets and optional property schemas.

## 3.8.0 - 2026-08-30

- Prevented Safari/iCloud Passwords from opening on Formula Compose and other fixed-choice dropdowns by removing their unnecessary generated search inputs.
- Retained Semantic UI controls, The Tech Wizard styling, grouping, dropdown arrows and normal selection behaviour.
- Kept search-enabled combo boxes only for workflows that require searching or custom entry, including URI Scheme and Data Source Filter/Input/Output.
- Added regression coverage distinguishing fixed-choice selection dropdowns from searchable combo boxes.

## 3.7.9 - 2026-08-30

- Fixed retained search text overlapping selected labels after editable Semantic UI dropdowns lose focus.
- Cleared the temporary search layer on blur for every generated searchable combo box.
- Added an inactive-state CSS safeguard and regression coverage for Input, Output, Filter and other shared searchable controls.

## 3.7.8 - 2026-08-30

- Fixed doubled and distorted text in editable Semantic UI dropdowns such as Data Source Filters.
- Hid the selected-value label only while the searchable input is focused or active, preserving the normal selected value when the control closes.
- Added regression coverage for the shared searchable-dropdown focus state.

## 3.7.7 - 2026-08-30

- Added required argument-count validation for every supported formula function.
- Rejected incomplete functions such as `right(group.name)` with a specific `expects 2 arguments but received 1` error.
- Ensured invalid function calls cannot produce misleading partial previews or enable Formula Compose Copy and Insert Into Field actions.
- Added coverage for missing, excessive and correctly nested function arguments.

## 3.7.6 - 2026-08-30

- Disabled Formula Compose Copy and Insert Into Field actions until the current formula validates and returns non-empty output for the selected preview device.
- Added immediate nested-brace validation so invalid expressions such as `{right({group.name}, 2)}` cannot be copied or inserted.
- Removed the `new-password` autocomplete value and applied search-specific password-manager suppression attributes to all static, generated and dynamic Semantic dropdown search inputs.
- Restricted Formula Compose Data Source variables to actual outputs from enabled Data Sources.
- Renamed output entries to the concise `Data Source: source name: output name` format and removed whole-source pseudo-variables.

## 3.7.5 - 2026-08-30

- Fixed Formula Compose so variables and functions inserted inside an existing formula use expression syntax without invalid nested braces.
- Added immediate inline guidance for nested or unmatched braces, including the corrected function example.
- Kept Property, Link Group, Link, Data Source and Authentication Secret editors open until the server confirms a successful save.
- Routed server validation failures back to the editor that initiated the save instead of the main administration status area.
- Added explicit, verified create/save button IDs and regression coverage for all five configuration sections.

## 3.7.4 - 2026-08-30

- Standardised screen, dialog, section and card heading typography across every administration screen using one Arial-based hierarchy and colour palette.
- Standardised main, wizard, nested and Visibility panel borders, backgrounds, corner radii and blue accents.
- Fixed Add/Edit Property Type and other ordinary Semantic dropdowns by refreshing the generated wrapper without re-exposing the original select or injecting its selected label into the search input.
- Enlarged every dropdown arrow and added consistent spacing from the right edge.
- Rebuilt Visibility rule rows as a responsive grid with stable widths for field, operator, value and action controls.

## 3.7.3 - 2026-08-30

- Matched Semantic heading and device-pane typography to the established pre-Semantic font sizes and inherited MeshCentral device-page sizing.
- Prevented dropdown refresh and value synchronisation from overwriting an active search or edit.
- Made selected values directly editable in searchable Filter, Input, Output and standard selection controls.

## 3.7.2 - 2026-08-30

- Standardised remaining source-facing branding on The Tech Wizard.
- Renamed the internal browser library namespace and generated URI-handler filenames to remove legacy product naming.
- Retained the v3.7.1 Semantic UI compatibility styling for review.

## 3.7.1 - 2026-08-30

- Restored the pre-3.7 The Tech Wizard visual layout while retaining Semantic UI component behaviour and accessibility.
- Added scoped compatibility styling for Semantic buttons, dropdowns, checkboxes, forms, headers, labels, cards, panels, messages, previews, tables and device-page components.
- Removed Semantic grouped-button and container behaviours that changed established spacing and page geometry.
- Restored the original administration width, form grids, card layout, dialog spacing and device Links/Properties presentation.

## 3.7.0 - 2026-08-30

- Standardised all plugin-owned administration controls and presentation components on Semantic UI, including forms, searchable dropdowns, checkboxes, buttons, headers, labels, cards, panels, messages, previews, tables and dialogs.
- Standardised plugin-rendered device Information, Properties, Links, Terminal-strip and bulk-command elements on Semantic UI without modifying unrelated MeshCentral controls.
- Replaced the Filter, Input and Output selectors with consistent searchable Semantic UI combo boxes and removed the duplicate Filter dropdown control.
- Filter suggestions now narrow as text is entered.
- Rebuilds Output Variable Input suggestions from the current preview response and active Filter, removing obsolete indexed paths.
- Added compound Filter expressions with AND (`&&`), OR (`||`) and nested parentheses while retaining case-insensitive `*` and `?` wildcard matching.

## 3.6.1 - 2026-08-30

- Restored Filter suggestions by deriving them directly from filterable objects and collections in the latest API response.
- Added an explicit Filter suggestion dropdown that remains usable in browsers which provide limited native datalist controls.
- Added compound Filter evaluation with AND (`&&`), OR (`||`) and nested parentheses, including wildcard comparisons within grouped conditions.
- Rebuilt Output Variable Input and Output suggestion lists with fresh identifiers whenever the API preview changes, preventing stale browser-cached choices.

## 3.6.0 - 2026-08-30

- Made Live Preview & Validation response panels collapsed by default on both Create and Edit Data Source screens.
- Added a dedicated step 10 Filters section whose filter applies to every API Output Variable Input, with migration from existing per-output filters.
- Renumbered API Output Variables to step 11 and Availability to step 12.
- Standardised the shared Formula Compose screen with Data Source, Property or Links context in its title.
- Grouped formula variables into User, System, Global, Device, Device Group, Data Source, Properties and Request Variables sections as applicable to the current context.
- Updated Formula Compose labels and documented the purpose of Insert Quoted Text directly in the dialog.

## 3.5.1 - 2026-08-30

- Added case-insensitive glob-style filtering to API Output Variables: `*` matches any number of characters and `?` matches exactly one character.
- Applied wildcard filters consistently in Live Preview & Validation, automatic value previews and server-side Data Source execution.
- Added wildcard suggestions and an inline example to the Filter interface.

## 3.5.0 - 2026-08-30

- Split API Output Variable extraction into guided Input, Filter and Output fields, each with preview-derived suggestions.
- Filtering a collection now returns the first matching object by default; Output can retain that complete object or select a single nested value.
- Added explicit Entire response and Entire matching object choices while preserving existing single-expression Output Variables.
- Removed the visible legacy inline-credential option; API authentication now presents named Authentication Secrets only.
- Vertically aligned Create Authentication Secret with the Saved Credential selector.

## 3.4.1 - 2026-08-30

- Prevented deletion of a Data Source while its result or named outputs are referenced elsewhere.
- Deletion rejection now lists the output name, internal reference, and exact consuming Data Source, Property, Link, Command, or Link Group field.
- Enforced the same validation on the server so it cannot be bypassed by a stale or modified browser request.

## 3.4.0 - 2026-08-30

- Added reusable named Authentication Secrets for bearer tokens, API-key/header credentials, and username/password credentials.
- Added an Authentication Secrets section with Create, Edit and Delete controls; secrets in use cannot be deleted.
- API Query authentication now selects a saved secret by name and can create one without leaving the Data Source editor.
- Retained compatibility with existing inline credentials while allowing them to be replaced by a reusable secret.
- Expanded API Output Variable Input suggestions to include every previewed array item by index and generated equality filters, including first-match object filters such as `data[?model == 'UDM Pro Max'] | [0]`.

## 3.3.10 - 2026-08-30

- Output Variable suggestions now use `[0]` when a preview array contains exactly one item, matching the existing Object classification and producing scalar paths such as `data[0].id`.
- Arrays containing multiple items continue to use projection paths such as `data[].id`.

## 3.3.9 - 2026-08-30

- Fixed dependent Request Variables failing after an upstream source had been previewed directly.
- API cache entries now include the output/JMESPath extraction configuration, preventing a raw preview response from being reused where named extracted outputs are required.

## 3.3.8 - 2026-08-30

- Disabled Data Sources are no longer selectable through Add From Data Source and cannot satisfy a Request Variable dependency.
- Formula Composer excludes variables and outputs belonging to disabled Data Sources.
- Formula Composer hides all Data Source variables while used inside the Data Source wizard; upstream outputs must be introduced explicitly through Add From Data Source.
- Existing Request Variables that reference a disabled or unavailable source now identify the dependency as unavailable instead of silently offering it for reuse.

## 3.3.7 - 2026-08-30

- Added immediate Data Source Identity validation and prevented duplicate names or derived internal keys from progressing through the wizard.
- Normalised friendly Request Variable placeholders such as `Site Id` to valid identifiers such as `site_id` when the field loses focus or a Data Source output is selected.
- Added inline validation for malformed and duplicate Request Variable placeholders so invalid requests do not reach Live Preview.
- Added current Request Variable placeholders to the Formula Composer variable list.
- Resolved Request Variable values in server-backed Formula Composer previews before evaluating the selected formula or template.

## 3.3.6 - 2026-08-30

- Removed Visibility from Data Sources; every enabled Data Source is now globally available.
- Added the dedicated `manage_data_sources` plugin permission for creating, testing, inspecting certificates, editing, and deleting Data Sources, including stored credentials.
- Allowed the administration page to be opened with either definition-management or Data Source-management permission and hid unauthorised sections.
- Added server-side field preservation so browser requests cannot modify definitions or Data Sources outside the user's granted permission.
- Restricted configuration import and export to users who hold both management permissions.

## 3.3.5 - 2026-08-29

- Allowed API Live Preview & Validation to execute with Device set to None.
- Added a device-free server context that retains user, system and prior Data Source variables without bypassing device permissions.
- Kept the existing permission-checked device context whenever a Device is selected.
- Removed the disabled Refresh action and Select a Device validation blocker for device-independent API requests.

## 3.3.4 - 2026-08-29

- Fixed Live Preview & Validation being hidden when Device was set to None.
- Kept step 9 visible once the API request configuration is complete, with a clear Select a Device status and disabled Refresh action until a Device is selected.

## 3.3.3 - 2026-08-29

- Classified an array containing one object as Object and an array containing multiple objects as Dataset; scalar paths remain Single Value.
- Automatically selects the current Output Variable Input when it is clicked.
- Added API Query step 3, Device, with None as the default and removed device-dependent formula variables when no Device is selected.
- Renumbered the remaining API Query stages and restored the blue Identity-stage border.
- Replaced the API preview controls with automatic Validation Status, a collapsible response Preview, and a compact Refresh action.

## 3.3.2 - 2026-08-29

- Made Output Variable Type a compact, top-aligned, single-line field.
- Classified arrays of objects as Dataset, a single object as Object, and scalar or non-object-array results as Single Value.

## 3.3.1 - 2026-08-29

- Renamed the certificate action to View Certificate and aligned it with Verify TLS Certificate.
- Decoupled API Live Preview & Validation from Output Variables so editing an output does not repeat the URL request.
- Renamed JMESPath to Input and added immediate type/value previews against the cached API response.
- Added HTTP/HTTPS URL validation before Authentication and later request steps become available.
- Updated Request Variable, URL, Header and Output Variable placeholders.
- Standardised the wizard actions as Save Data Source, Save Property and Save Link.

## 3.3.0 - 2026-08-29

- Added a View action beside Verify TLS Certificate that displays the endpoint certificate subject, issuer, validity, alternative names, fingerprint, protocol, cipher and verification result.
- Moved API Live Preview & Validation to step 8 and reveal it only when the request and selected authentication fields are complete.
- Simplified API authentication to None, Stored Bearer Token, Stored API Key / Header Value, and Stored Username & Password, with `X-API-Key` pre-filled for header authentication.
- Retained server-side support for existing environment-variable authentication definitions while removing those choices from the editor.
- Moved API Output Variables, Availability and Visibility to steps 9, 10 and 11.
- Added response-derived JMESPath suggestions and per-variable Dataset, Object or Single Value classification with a live value preview.
- Changed API previews to return the unmodified response so multiple Output Variables can be designed and inspected accurately.

## 3.2.2 - 2026-08-29

- Removed the API Allowed Hosts setting and its server-side allowlist requirement.
- Added per-source TLS certificate verification, enabled by default and optionally disabled for trusted internal services with private or self-signed certificates.
- Expanded preview failures with specific TLS, DNS, timeout, refused-connection, reset, redirect, HTTP-status and non-JSON response guidance.
- Kept technical failure messages free of authentication headers, bodies and URL query strings.
- Limited a preview run to the selected source and its transitive Data Source dependencies.

## 3.2.1 - 2026-08-29

- Reordered Static List workflow steps to Validation & Preview, Variable, Availability and Visibility.
- Restyled Data Source Visibility as a numbered blue-striped wizard card.
- Ensured hidden database fields remain hidden even when their layout class specifies a display mode.
- Limited SQLite connections to the database filename and network databases to their relevant connection fields.
- Reset database ports to 3306 for MySQL/MariaDB and 5432 for PostgreSQL whenever the database type changes.
- Explained that Allowed Hosts is a security allowlist protecting API credentials and requests from unexpected destinations.

## 3.2.0 - 2026-08-29

- Added no-default Data Source type selection for Static List, Database Query and API Query.
- Added progressive sections, automatic validation, retry controls and a reusable Preview action.
- Added friendly and advanced Static List entry editors that preserve data when switching modes.
- Added read-only MySQL, MariaDB, PostgreSQL and SQLite query sources with connection tests, tabular previews, filtering, limits, and Set, Row, Column and Cell output modes.
- Added friendly API request-variable dependencies, authentication, header, limit and multi-output editors.
- Derived source and output variable keys automatically from their display names while retaining masked stored credentials.
- Preserved existing API response-expression sources and added focused validation tests for all new source types.

## 3.1.0 - 2026-08-29

- Expanded Data Sources to extract multiple named Output Variables from one JSON response using JMESPath.
- Added reusable Request Variables for adaptable placeholders such as `{siteId}`, `{deviceId}` and `{request.siteId}`.
- Added automatic dependency ordering so Request Variables can consume outputs from other Data Sources using `api.source_key.output_key`.
- Added masked, revealable stored bearer-token, API-key/header and basic-auth credentials while retaining environment-variable authentication compatibility.
- Reorganised the Data Source editor into request, variables, authentication, outputs, limits and visibility sections.
- Added Data Source output variables to the formula composer as `api.source_key.output_key`.

## 3.0.2 - 2026-08-29

- Aligned the Input Type control with Default Value as a single-line selector.
- Renamed Item Colour to Colour and hides it while Link Group colour inheritance is selected.
- Suppressed password-manager detection on the URI Scheme search control.
- Shows Link and Data Source Visibility only while the definition is enabled.
- Changed new Data Sources to disabled by default.

## 3.0.1 - 2026-08-29

- Refined Property Identity and Display layout with four-digit ordering controls.
- Added independent Name and Read-Only Value foreground, background and style controls.
- Changed new Property and Link definitions to disabled by default.
- Rebuilt Create Link as a six-stage URL/Command wizard.
- Removed formula-driven Link Names while retaining formulas for descriptions, hints, URLs and commands.
- Removed the Data Source key field and now derives stable keys from unique Names.

## 3.0.0 - 2026-08-29

- Renamed and rebranded the plugin as Links & Properties.
- Added separate Information and Properties device tabs for Read-Only and Input properties.
- Rebuilt property creation as a progressive wizard with automatic permanent keys and unique Display Names.
- Added Display Name colour, background, bold, italic and underline controls.
- Removed Advanced JSON from the property editor while retaining compatible stored definitions.
- Adopted a locally bundled Semantic UI searchable selection dropdown with URI-scheme descriptions.
- Updated editor terminology for Property Definitions, Link Groups, Links and Data Sources.

## 2.2.7 - 2026-08-28

- Collected Agent-console output from MeshCentral's streamed console channel and updated the output dialog live.
- Completed Agent-console commands after a bounded four-second collection window instead of leaving them permanently running.
- Added disconnected-agent detection and a five-minute timeout for ordinary shell commands.

## 2.2.6 - 2026-08-28

- Added explicit enable switches for value validation and input masks; disabled features are hidden and excluded from saved definitions.
- Renamed Applicability to Visibility throughout the property and data-source editors.
- Made computed and default property formulas mutually exclusive in the editor.
- Added a visible IANA URI-scheme browser alongside the searchable autocomplete field.

## 2.2.5 - 2026-08-28

- Moved Quick Command and Links to the primary device-action area ahead of the separate Quick Commands plugin.
- Anchored the panel to MeshCentral's stable General-page insertion point instead of the late device-details placeholder.

## 2.2.4 - 2026-08-28

- Fixed the Properties panel remaining hidden because its stylesheet default overrode the cleared inline display value.
- Tracked Properties visibility explicitly so normal device navigation restores the correct MeshCentral page.
- Re-rendered cached Quick Command and Links content whenever General is selected after MeshCentral rebuilds the device markup.

## 2.2.3 - 2026-08-28

- Fixed blank content when switching between the dedicated Properties tab and MeshCentral's Plugins tab.
- Kept Properties independent of MeshCentral's internal Plugins page state while preserving normal General-tab navigation.
- Added an explicit device-data refresh when MeshCentral reports a device-group change.

## 2.2.2 - 2026-08-28

- Fixed legacy local-group conditions that could hide items assigned to those groups.
- Displayed individual items first, followed by non-empty local groups with distinct inner borders and group colours.
- Moved device properties out of MeshCentral's shared Plugins page into a dedicated Properties tab immediately after General.
- Restored the native typed property form for ordinary property definitions and improved multi-select, tags and date-time handling.

## 2.2.1 - 2026-08-28

- Replaced the fixed URI scheme dropdown with a searchable autocomplete field.
- Official IANA schemes are offered as suggestions while valid custom and unknown schemes can still be entered directly.
- Preserved automatic URL-prefix updates when choosing or entering a URI scheme.

## 2.2.0 - 2026-08-28

- Added local-group permissions and visibility rules for device groups, users, user groups and individual devices.
- Added explicit item precedence: items inherit their local-group rule or override it for that item only.
- Preserved existing item visibility during migration by treating pre-2.2 item rules as overrides.

## 2.1.0 - 2026-08-28

- Added a dedicated Local groups editor with names, descriptions, display order and colour pickers.
- Added per-item colour pickers with optional inheritance from the selected local group.
- Added a separate formula-capable hover hint for quick commands and links.
- Replaced the legacy Protocol control with an official IANA URI-scheme picker plus Custom.
- Automatically prefixes link URLs when a URI scheme is selected and disables automatic capitalisation for URI inputs.

## 2.0.0 - 2026-08-28

- Replaced separate direct links with unified Quick Command and Link cards.
- Added automatic migration of existing links, display groups, row/position ordering and two-line formula-driven cards.
- Added command execution through MeshCentral Remote Commands, Terminal typing, per-device output, multi-device execution and a device context-menu entry.
- Expanded applicability to users, plugin display groups, operating systems and connection state while retaining nested ALL, ANY and NONE logic.
- Added correlated save acknowledgements; item editors close only after the server confirms persistence.
- Expanded the formula library with text search/replacement, lists, conversions, aggregates, URL encoding and date functions.
- Interface patterns adapted from MeshCentral QuickCommands under the Apache-2.0 licence.

## 1.3.0 - 2026-08-28

- Replaced the custom formula evaluator with a sandboxed JEXL expression engine while retaining existing formula syntax.
- Added schema-driven device forms and validation with Jedison, Ajv and `ajv-formats`.
- Expanded property types with password, email, telephone, colour, integer, range, time, date-time, month, week, multi-select and tag lists.
- Added optional advanced JSON Schema, IMask-powered input masks and server-side validation.
- Added controlled server-side JSON API data sources with host allowlists, environment-variable credentials, response-size/time limits, JMESPath extraction and Keyv caching.
- Added API formula variables and dynamic selectable-list options.
- Added Linux desktop URI-handler registration through XDG desktop entries and MIME associations, alongside Windows registration.
- Added reviewable installers and backups of overwritten Linux desktop/MIME configuration.

## 1.2.0 - 2026-08-28

- Added support for registered, custom and unknown OS-handler URI schemes, including `file:`.
- Added administrator-controlled support for registered and unknown URI schemes.
- Added a Windows URI-handler registration wizard using MeshCentral's native Remote Commands permission and audit channel.
- Added reviewable `.reg` downloads for unmanaged Windows computers without collecting remote credentials.
- Added configurable regular-expression validation, minimum/maximum lengths, custom error messages and validation presets.
- Added configurable input masks using digit, letter and alphanumeric tokens, placeholders and case conversion.
- Added a formula composer to property and link fields with variable/function insertion, copy, field insertion and live device-backed previews.

## 1.1.0 - 2026-08-28

- Fixed Cancel and close controls so required-field validation cannot block dismissal.
- Added property computed-value and default-value formulas.
- Added system variables, `now()`, string functions and arithmetic expressions.
- Added formula support to property/link names, descriptions and link URL values.
- Added fallback/default link URLs.
- Added an explicit custom-URI protocol mode while retaining blocks on unsafe schemes.

## 1.0.0 - 2026-08-28

- Initial release.
- Added seven typed property fields.
- Added nested ALL, ANY, and NONE applicability rules.
- Added database-backed per-device values.
- Added conditional direct HTTP/HTTPS device links.
- Added Properties device tab, match preview, permissions, auditing, and JSON import/export.
