# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

---

## Security Architecture

Poly-AI is a Bring-Your-Own-Key (BYOK) studio designed around strict isolation and defense-in-depth:

1. **Envelope Encryption (AES-256-GCM)**:
   - Provider API keys are encrypted at rest with authenticated AES-256-GCM using `node:crypto`.
   - The encrypted payload follows a versioned format: `v1.<iv>.<tag>.<ciphertext>`.
   - Keys are never stored in plaintext and cannot be decrypted without `KEY_ENCRYPTION_SECRET`.

2. **Server-Only Decryption**:
   - Provider keys and decryption logic are never imported into client-side bundles.
   - Keys are decrypted in memory only when establishing outgoing provider streams or queue requests.
   - Network payloads returning to the client never include plaintext secrets or encrypted tokens.

3. **Sandboxed Website Preview**:
   - User-generated website artifacts run inside an isolated `<iframe>` with strict sandbox flags: `allow-scripts allow-forms allow-popups`.
   - `allow-same-origin` is deliberately omitted to prevent generated scripts from reading application cookies, local storage, or session tokens.

---

## Reporting a Vulnerability

If you discover a security vulnerability in Poly-AI, please report it responsibly:

- **Email**: Send vulnerability reports directly to `sparamveer1001@gmail.com`.
- **Private Advisory**: Alternatively, submit a report via [GitHub Security Advisories](https://github.com/paramcodes/poly-ai/security/advisories/new).

Please include:
- A description of the vulnerability and its potential impact.
- Step-by-step reproduction steps or a minimal proof of concept.
- Any suggested mitigations if known.

We will acknowledge receipt within 48 hours and work with you to coordinate a responsible disclosure and patch. Please do not open public issues regarding active vulnerabilities.
