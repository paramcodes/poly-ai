# ADR 0004: BYOK key encryption with AES-256-GCM

- **Status:** Accepted
- **Date:** 2026-10-20
- **Deciders:** Poly-AI maintainers

## Context

Poly-AI is a multi-user application in which **the user supplies the provider
credentials**. That is the product: the user pastes their own `OPENAI_API_KEY`,
`FAL_KEY`, `REPLICATE_API_TOKEN` and so on, and Poly-AI uses that key to call the
provider on their behalf.

That makes the credential store the highest-value target in the system. The threat model
is not "a determined attacker with root on the database" — that is out of scope for any
v1 hosted app. It is the realistic set:

- **The database is not a trusted store.** A read-only leak of the `providers` table
  (backup snapshot, misconfigured replica, a support engineer with SQL access, a
  dashboard query) would otherwise hand over every user's third-party key.
- **The repository and the build output are not trusted.** Keys must never be committed,
  bundled into the client, or read from a public environment variable.
- **Logs and error messages are not trusted.** Provider keys get logged by accident more
  often than they get stolen deliberately: a debug log of a request object, an unhandled
  rejection that prints a header, an analytics call that captures a request body.
- **The client must never see a key.** Even a user's own key should not round-trip
  through the browser; once it is stored, the client only needs to know that a key exists.

The environment also constrains the solution: the key must be decrypted **at the moment a
provider call is constructed**, inside a request handler, and the plaintext must not
outlive that request.

## Decision

Provider keys are encrypted **at rest** with **AES-256-GCM**, keyed by a single
server-side master secret, and decrypted **only inside server route handlers**.

### Key material

- A **32-byte master secret** is provided as the environment variable
  `KEY_ENCRYPTION_SECRET` (base64-encoded in the environment). It lives **only in the
  server environment** — never in the database, never in the client bundle, never in the
  repository. It is the same secret for all users; per-record separation comes from a
  fresh random IV per encryption, not from per-user keys.
- The value is read lazily inside server code, and the module must fail closed: if
  `KEY_ENCRYPTION_SECRET` is missing or is not exactly 32 bytes, key operations throw and
  generation requests fail rather than silently falling back to an unencrypted or
  zero-keyed path.

### Record format

Each stored key is a single string:

```
v1.<iv>.<tag>.<ciphertext>
```

- All four segments are **base64url** encoded.
- `iv` — a random **12-byte** IV, freshly generated per encryption with
  `crypto.randomBytes(12)`. AES-GCM with a 96-bit IV is the recommended size; we never
  reuse an IV under the same key because each encryption generates a new one.
- `tag` — the **16-byte GCM authentication tag**, kept alongside the ciphertext so a
  truncated or tampered record is detected on read.
- `ciphertext` — the encrypted UTF-8 key material.
- The `v1.` prefix is the **format version**. It exists so the format can be rotated
  later (a new algorithm, a new KDF, a new field) without ambiguity: readers dispatch on
  the prefix, and unknown versions fail closed with an explicit error.

Encryption and decryption use `node:crypto`'s `createCipheriv('aes-256-gcm', key, iv)`
and `createDecipheriv(...)`, with `setAuthTag` on the decrypt side so that a failed
authentication raises rather than returning garbage.

### Where plaintext may exist

Plaintext key material exists in exactly one place: the local scope of a server route
handler, at the moment a provider client is constructed. It is passed to the provider SDK
or to the `fetch` call and is then out of scope.

Explicit rules, all of which are testable:

- Decryption happens **only** in server route handlers, at the moment the provider call
  is constructed. There is no endpoint that returns a decrypted key, for any user,
  including the owner of the key.
- Plaintext is **never returned to the client**. The API surface for a provider row
  exposes metadata and `apiKeyHint` only.
- Plaintext is **never logged**, not even at debug level, and not even partially.
- Plaintext is **never included in an error message** that reaches the client. Decryption
  failures surface as a generic "the stored credential could not be decrypted" message.
- Plaintext is **never serialised into a `generations` row**. Generation history stores
  the provider id, the model id, and the resulting asset reference — not the key.

### What the UI sees

The client receives **`apiKeyHint`**: the last four characters of the key, rendered as
`••••a1b2`. This is enough for a human to tell "is this the key I pasted, or the one
before it?" and useless to an attacker who obtains the database. The hint is stored
alongside the ciphertext (it is derived from plaintext at write time) and is never a
recoverable value.

### Rotation

Rotation is a **one-shot script** that reads the master secret, decrypts every stored key
with the old secret, re-encrypts with the new one, and writes the new `v1.` records back
in a single transaction. The format version prefix means the reader can also accept both
old and new secrets during a migration window. There is no key-rotation service, no
scheduled rotation, and no per-key version history in v1.

## Consequences

### Positive

- A database leak yields ciphertext, not usable provider keys. The attacker's next step
  is to obtain `KEY_ENCRYPTION_SECRET`, which lives in the deployment environment and is
  not in the database.
- **GCM is authenticated**, so a modified ciphertext fails to decrypt instead of yielding
  a corrupted key that produces confusing provider errors. The `tag` is stored explicitly
  rather than prepended, which keeps the parsing unambiguous.
- **The versioned format makes future rotation cheap.** Adding a `v2.` algorithm or a
  KDF later is an additive change to the reader, not a migration of every row.
- **The client never handles the secret**, so an XSS in the app does not directly expose
  stored keys — it exposes ciphertext and the hint only.
- **No new infrastructure.** AES-256-GCM is in `node:crypto`, which needs no SDK, no
  network call, and no KMS configuration.
- The `apiKeyHint` pattern gives users a usable confirmation without giving away the
  value.

### Negative / costs

- **One master secret is a single point of failure.** Losing `KEY_ENCRYPTION_SECRET` makes
  every stored key permanently unreadable — the app cannot recover them, and the user
  must re-enter them. We mitigate with environment backups and documentation, not with
  cryptography.
- **The secret protects keys at rest, not in use.** A compromised server process, an
  SSRF that reaches a provider we control, or a debugging session that prints the
  decrypted value defeats it. GCM does not protect against an attacker who is already
  inside the function.
- **Rotation is manual.** The one-shot script must be run deliberately, in an environment
  where both secrets are available. There is no automated rotation schedule.
- **AAD is not used.** The ciphertext is not bound to a row identifier, so a ciphertext
  could in principle be moved between rows of the same user and still decrypt. This is a
  low-severity issue (it does not leak the key to another user) but it is a hardening
  opportunity we have consciously deferred.
- **The plaintext lives in a heap-allocated string** for the duration of the request. It
  is not zeroed after use, and JavaScript gives us no reliable way to zero it. This is a
  property of the runtime, not of the design.

### Neutral / follow-ups

- `node:crypto` is a hard reason the app runs on the **Node.js runtime** (ADR-0001); the
  Edge runtime has no equivalent primitive.
- The `apiKeyHint` is stored separately from the ciphertext. It should be considered
  low-sensitivity personal data for retention and privacy purposes.
- A follow-up to evaluate: binding the row id as GCM additional authenticated data (AAD)
  so a ciphertext cannot be transplanted between rows.

## Alternatives considered

**Storing keys in plaintext.** Rejected outright. It is the default in many BYOK
prototypes and it means every database read path — backups, replicas, support tooling —
is a credential exfiltration event. There is no requirement that makes plaintext
acceptable here.

**Environment-variable-only keys (one key per deployment).** Rejected because it makes
Poly-AI a single-user tool. The application is explicitly multi-user: each user brings
their own key and their provider list is per-user. A shared environment key would mean
one account's usage is billed to everyone, and users could not use their own
subscriptions, quotas, or rate limits.

**A secrets manager (HashiCorp Vault, AWS KMS, GCP Secret Manager, Cloudflare Secrets).**
Rejected for v1 as overkill with a real operational cost: it adds a network dependency to
the hot path of every generation request, requires credentials-of-credentials to be
configured, introduces availability coupling (the app cannot generate if Vault is down),
and needs a whole class of IAM policy to get right. The benefit — envelope encryption with
audited, rotatable keys — is genuinely valuable, but it is not proportionate to a v1
with a handful of users. Revisit if compliance requires it.

**Per-user derived keys via HKDF.** Rejected for v1, kept as a future hardening step. It
is defence in depth: deriving a per-record key from the master secret and a per-record
salt means a partial decryption oracle leaks less. It costs an extra HKDF call and a
stored salt per record, and it does not change the trust model (the master secret is
still the root of trust). Worth revisiting if the compliance bar rises.

## Revisit triggers

- **Multi-tenant hosting with compliance obligations** (SOC 2, GDPR, or a customer
  contract) that requires envelope encryption, key-access audit logs, or a secrets
  manager.
- **A shared secrets manager becomes available** to us — either because we adopt an
  infrastructure provider that offers one, or because a hosting plan includes it.
- **We add team or organisation accounts**, where a key may be shared by multiple users
  and revocation, per-organisation access control and access logging become requirements
  rather than nice-to-haves.
- The number of stored credentials grows large enough that the operational risk of
  losing `KEY_ENCRYPTION_SECRET` (every key unreadable) warrants splitting the secret
  or adding a recovery path.
