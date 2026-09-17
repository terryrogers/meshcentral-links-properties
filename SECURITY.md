# Security Policy

## Supported Version

Security fixes are evaluated against the current source version. Older retained packages are historical evidence and are not automatically supported or safe to deploy.

## Reporting A Vulnerability

Do not include credentials, private endpoints, personal information, exploit data, or sensitive logs in a public issue.

Use GitHub's private vulnerability-reporting or Security Advisory facility for this repository when it is available. If that facility is unavailable, contact the repository owner through their GitHub profile without disclosing sensitive details publicly.

Include the affected plugin version, MeshCentral version, configuration conditions, impact, reproduction steps, and a minimal redacted proof of concept. Reports will be assessed before any public disclosure or release claim.

## Security Boundaries

- Stored authentication secrets are visible to authorised plugin administrators and configuration exports.
- Server-side API and database sources can reach destinations available to the MeshCentral host. Administrators must restrict configuration access and choose trusted endpoints.
- Disabling TLS certificate verification is intended only for explicitly trusted private services and weakens transport authentication.
- Custom URI handlers execute through software registered on the endpoint. Administrators must review schemes, templates, and generated registration files before use.
- Release archives must be obtained from a verified release and checked against its published checksum when one is supplied.
