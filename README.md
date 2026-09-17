# Links & Properties

Version 3.8.3 presents read-only Information as compact, borderless label/value rows using the configured display styles. Version 3.8.2 shows the Information and Properties tabs only when matching fields exist and restores compatibility with the separate Quick Commands General-page panel.

Version 3.2.2 removes the API host allowlist, adds per-source TLS certificate verification control for trusted internal APIs, and expands preview failures with actionable DNS, connection, timeout, TLS and HTTP diagnostics. Previewing one source now executes only that source and its dependencies.

Version 3.2.1 refines the Data Source wizards with correctly ordered Static List validation, consistent Availability and Visibility cards, database-specific connection fields and automatic standard database ports.

Version 3.2.0 adds progressive, dynamically validated Data Source workflows for Static Lists, read-only MySQL, MariaDB, PostgreSQL and SQLite queries, and API queries. Each workflow reveals only the relevant sections, supports automatic connectivity/request tests, and provides previews of returned and selected variable data. API sources support friendly request variables, headers, masked stored credentials, dependency outputs and multiple named output variables.

Version 3.1.0 presents the plugin as Links & Properties. Read-Only properties appear on a dedicated Information tab, Input properties appear on Properties, and progressive Property and Link wizards automatically create stable keys and reveal relevant controls. Links and commands retain formula-capable descriptions and configuration, visibility, grouping, multi-device execution and context-menu capabilities. Data Sources can resolve reusable request placeholders, authenticate with masked stored credentials or environment variables, and extract multiple named values from one JSON response.

QuickCommands interface patterns are adapted from https://github.com/v3DJG6GL/MeshCentral-QuickCommands under the Apache License 2.0; this plugin is an independent modified implementation and retains its original internal short name for migration safety.

Version 1.3 adds schema-driven fields, JEXL formulas, controlled server-side API data sources and Windows/Linux desktop URI registration. Existing version 1 and 2 definitions are loaded without destructive migration.

## Data Sources

API sources are configured in the plugin admin page. Requests run on the MeshCentral server, accept only `http` or `https`, do not follow redirects, and enforce time and response-size limits. TLS certificates are verified by default; verification can be disabled per source for a trusted internal service using a private or self-signed certificate. Reusable Authentication Secrets can hold named bearer tokens, API-key headers or username/password credentials and be selected by multiple Data Sources; older inline credentials remain compatible. Stored credentials are masked in the editor but are part of the plugin configuration and therefore visible to authorised plugin administrators and configuration exports. Request Variables map adaptable placeholders such as `{siteId}` or `{request.siteId}` to literals, device properties, formulas, or outputs such as `{api.site_lookup.site_id}` from another Data Source. Dependencies are ordered automatically and missing, disabled or circular dependencies are rejected with a clear error. Output Variables use JMESPath to publish multiple results from one response as `api.sourceKey.outputKey` for Property formulas and dependent requests. Preview-driven Input suggestions include complete arrays, indexed objects, projected fields and generated equality filters.

## Formula engine

Expressions inside `{...}` are evaluated by JEXL with an explicit function allowlist. Available roots are `property`, `device`, `group`, `system`, `api`, and the per-source `request` variables. HTTP requests and JavaScript evaluation are not available from formulas.

## URI handlers

Windows registration writes the current user's handler under `HKCU`. Linux desktop registration creates an XDG `.desktop` entry under the signed-in user's `~/.local/share/applications` and associates `x-scheme-handler/<scheme>` through `xdg-mime`. Linux registration is per graphical user and may still require browser confirmation; it is not useful on a headless-only account.

MeshCentral plugin for typed per-device metadata and conditional direct HTTP/HTTPS management links.

## Features

- Property types include URL, text, multiline text, password, email, telephone, colour, number, integer, range, Boolean, date/time variants, selectable lists, multi-select and tags.
- Nested applicability rules using ALL, ANY, and NONE groups over device group, tag, and individual device conditions.
- Separate Information and Properties device tabs positioned between General and Terminal.
- A conditional Links section on General, with ungrouped items first and non-empty Link Groups in bordered panels.
- Property-backed URL templates such as `{property.managementUrl}`.
- Computed and default property values, including dependencies on other properties.
- Web links and controlled custom URI schemes such as `ssh:`, `rdp:`, `putty:` and `mailto:`.
- Link fallback/default URLs when a primary formula cannot resolve.
- Built-in device, group and system variables, including server name, DNS name, server URL and domain.
- Safe formula functions for concatenation, case conversion, length, substring operations, arithmetic and `now()`.
- Highly configurable property validation using presets, regular expressions, length limits and custom error messages.
- Input masks with digit (`0`), letter (`A`) and alphanumeric (`*`) tokens, placeholders and case conversion.
- A formula composer with selectable variables/functions, live device-backed results, clipboard copy and direct field insertion.
- URI-handler registration for managed Windows agents through MeshCentral's audited Remote Commands channel, plus `.reg` downloads for unmanaged Windows computers.
- MeshCentral database persistence, optimistic revision checks, audit events, permissions, import/export, and live match previews.

## Permissions

- `manage_definitions`: manage property and direct-link definitions.
- `manage_data_sources`: create, test, inspect, edit, and delete Data Sources, including stored credentials.
- `edit_device_values`: edit values on accessible devices. Full administrators and users with Mesh Edit/Manage Computers rights can also edit.

## Persistence

Configuration and values are stored in MeshCentral's `main` collection/table using document types `devicepropertieslinks-config` and `devicepropertieslinks-values`.

Editable property presets are stored separately at `meshcentral-data/plugins/devicepropertieslinks/data/property-presets.json`. The file is created from `defaults/property-presets.json` when absent and is not included in release archives, so deployments do not overwrite local preset changes. Validation and input-mask presets can be renamed, adjusted, added or removed by editing that persistent JSON file and then refreshing the plugin administration page.

## Upgrade note

The plugin injects dedicated Information and Properties device tabs immediately after General at runtime. It no longer shares MeshCentral's Plugins page, and no MeshCentral template or core source file is modified.

Before publishing a release, run `npm run prepare:update-assets` after creating the versioned archive. Publish all three files from `dist/update-assets` at the URLs declared by `config.json`. This keeps MeshCentral's Latest-version check from remaining on `Checking...` because of a missing manifest, changelog, or download archive.

## Formula reference

Place formulas inside braces. Plain text outside braces is preserved.

- Properties: `{property.managementUrl}`
- Device: `{device.name}`, `{device.hostname}`, `{device.ip}`, `{device.id}`
- Group: `{group.name}`, `{group.id}`
- System: `{system.serverName}`, `{system.dnsName}`, `{system.serverUrl}`, `{system.domain}`
- Current timestamp: `{now()}`

Functions: `concat`, `proper`, `upper`, `lower`, `trim`, `len`, `substring`, `left`, `right`, `coalesce`, `add`, `subtract`, `multiply`, `divide`, `mod`, `round`, and `abs`.

The arithmetic operators `+`, `-`, `*`, `/`, and `%` are supported inside formulas. Examples:

```text
{proper(device.name)}
{concat(system.serverUrl, "device/", lower(device.name))}
{property.sshPort + 1}
{left(now(), 10)}
```

Property formulas are resolved in dependency order. Circular or unresolved references remain unset. A computed value is read-only and overrides a stored device value; a default is used only when no stored value is available.

## URI schemes and registration

Custom link mode accepts any syntactically valid registered or unknown scheme, including `ssh:`, `rdp:`, `putty:`, `mailto:` and `file:`. Administrators are responsible for only configuring schemes and destinations that they trust.

The URI scheme field is searchable and offers autocomplete suggestions from the official IANA scheme list. A custom or unknown scheme can be entered directly when it does not appear in the suggestions.

The registration wizard supports:

- A MeshCentral-managed Windows device with a compatible agent. Registration is submitted through MeshCentral's native `runcommands` action, requires the user's Remote Commands right, runs only in a signed-in user context and is recorded by MeshCentral's core event audit.
- An unmanaged Windows computer through a generated `.reg` file that can be reviewed before import.

The plugin does not request, transmit or store remote endpoint passwords. Adding direct WinRM/SSH credential handling would require a separate encrypted credential-vault design and is intentionally outside this plugin.

## Compatibility

The plugin manifest declares MeshCentral `>=1.2.5`. Compatibility should be verified against the exact MeshCentral release and database backend used for a deployment.

## Installation

1. Obtain a reviewed `devicepropertieslinks.zip` from a published GitHub Release.
2. Verify the archive checksum when the release supplies one.
3. Back up the existing plugin directory and persistent plugin data.
4. Install the archive using MeshCentral's supported plugin-management workflow.
5. Confirm that the loaded plugin version matches the intended release and that existing persistent property presets remain intact.

The repository currently publishes source only. The manifest's latest-release download URL will become usable when a reviewed release asset is published.

## Configuration

Configuration is managed through the MeshCentral plugin administration page. Use neutral or environment-specific values at deployment time; do not commit credentials or private endpoints to this repository.

Example API source values:

```json
{
  "method": "GET",
  "urlTemplate": "https://api.example.test/devices/{device.id}",
  "tlsVerify": true,
  "auth": {
    "type": "bearerEnv",
    "tokenEnv": "EXAMPLE_API_TOKEN"
  }
}
```

`example.test` is reserved for documentation. Replace it with an authorised endpoint and provide secrets through the supported protected configuration mechanism.

## Development And Testing

Install the exact locked dependencies and run the test suite:

```text
npm ci
npm test
```

Run JavaScript syntax checks for changed executable files and audit production dependencies before preparing a release.

## Build And Packaging

Rebuild the checked-in vendor bundles with:

```text
npm run build:vendor
```

After creating and independently reviewing a new versioned plugin archive, prepare the update-service files with:

```text
npm run prepare:update-assets
```

Generated files under `dist` are intentionally excluded from Git. A successful distributable build requires a new canonical version and synchronized OpenProject version, Git tag, and GitHub Release; do not overwrite a historical release artefact.

## Version History

The changelog records 52 source versions from `1.0.0` through `3.8.3`. Local retained archives independently confirm 51 built versions. Version `3.7.9` has changelog evidence but no retained build archive and must not be represented as a verified historical build.

Historical and legacy archives remain private retained evidence because their bundled configuration contains internal deployment references. They are not included in this public repository and must not be published without version-preserving sanitation and an independent review.

## Security And Licensing

See `SECURITY.md` for responsible reporting and operational security boundaries. See `THIRD_PARTY_NOTICES.md` for required third-party attribution.

No reliable project-wide licence was found in the retained source. No project-wide licence has therefore been inferred or granted by this repository.
