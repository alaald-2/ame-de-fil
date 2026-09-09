# Security Policy

For the security _architecture_ (auth, RBAC, threat model, GDPR design), see [`docs/SECURITY.md`](docs/SECURITY.md). This file is the disclosure policy.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a suspected security vulnerability.

Preferred channel: use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) on this repository (enable it under **Settings → Security → Advisories** if not already active) so the report and any discussion stay private until a fix ships.

If private reporting isn't available, contact the maintainer directly via the contact information on the repository owner's GitHub profile rather than a public channel.

Please include:

- A clear description of the vulnerability and its potential impact.
- Steps to reproduce (minimal repro preferred).
- Any relevant logs, request IDs, or affected versions/commits.

**Please do not** include a working exploit for a live/production instance in a report — a description of the vulnerability class and reproduction steps against a local/test environment is sufficient.

## Supported versions

This project has not yet reached a first release; there is no supported-version matrix until `v1.0.0` ships (`docs/ROADMAP.md`). Once released, this section will list which versions receive security fixes.

## Scope

In scope: the applications and packages in this repository (`apps/storefront`, `apps/api`, `apps/admin`, `packages/*`). Out of scope: third-party services we integrate with (Stripe, hosting providers, etc.) — report those directly to the respective vendor.
