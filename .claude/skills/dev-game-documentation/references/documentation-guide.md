# Documentation Writing Guide

## Evidence hierarchy

Use information in this order:
1. Directly observed behavior in the running game
2. Source code and configuration
3. Existing project documentation
4. Explicit user-provided description

If sources disagree, report the discrepancy instead of silently choosing a convenient answer.

## Writing style

- Be concise, specific, and factual.
- Describe what a player can do, not what the game might eventually do.
- Label roadmap items as planned or proposed.
- Avoid unsupported superlatives such as "best", "revolutionary", or "fully optimized".
- Explain controls using the exact keys/buttons implemented.
- Describe win/lose conditions only when verified.

## Screenshot captions

Each caption should answer:
- What screen/state is shown?
- What important UI or mechanic should the reader notice?
- Is this a normal gameplay capture or a special/test state?

## Privacy and security

Do not include:
- API keys, tokens, passwords, or `.env` values
- internal hostnames or private IPs unless explicitly approved
- personal file paths or usernames
- user data visible in a game or debug overlay

Blur/redact sensitive information only if authorized and preserve the unmodified original separately when required by the project's policy.
