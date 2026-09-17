# Third-Party Notices

This repository contains or adapts third-party software. Each component remains governed by its own licence; these notices do not grant a project-wide licence for Links & Properties.

## MeshCentral QuickCommands

Interface patterns were adapted from [MeshCentral QuickCommands](https://github.com/v3DJG6GL/MeshCentral-QuickCommands), licensed under the Apache License 2.0. The adapted implementation is independent and retains the original internal plugin short name only for migration compatibility.

A copy of the Apache License 2.0 is provided at `LICENSES/Apache-2.0.txt`.

## Bundled Browser Assets

- jQuery is distributed under the MIT License. Its minified source retains its licence banner.
- Semantic UI CSS is distributed under the MIT License.
- Font Awesome assets included through Semantic UI identify their icon, font, and code licences in the embedded SVG metadata: CC BY 4.0, SIL Open Font License 1.1, and MIT respectively.

## Generated Vendor Bundles

The server and browser vendor bundles are built from dependencies declared in `package.json` and locked by `package-lock.json`. Generated legal comments are retained in `lib/vendor-server.cjs.LEGAL.txt`. Downstream distributors must review the dependency versions and applicable licence texts for the exact bundle they distribute.

## No Project-Wide Licence

No reliable project-wide licence grant was present in the retained source. Consequently, no root `LICENSE` file has been invented. Copyright and reuse permission for original Links & Properties code remain unresolved until the owner selects and records a licence.
