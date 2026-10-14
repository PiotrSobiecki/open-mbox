# Security

Report a vulnerability privately through GitHub: **Security → Report a vulnerability** on this repository. Please do not open a public issue for it.

Most relevant here: anything that lets a mailbox's contents leave the browser, lets a message run script or fetch remote content, or weakens the headers set in `src/security-headers/` and the content security policy in `astro.config.mjs`.

Only the latest deployment is supported. Dependencies are updated weekly by Dependabot, and its security alerts are enabled.
