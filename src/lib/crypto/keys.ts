import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV
const EXPECTED_KEY_BYTES = 32; // 256-bit AES key
const FORMAT_PREFIX = "v1";

/**
 * Resolves the 32-byte master encryption secret from KEY_ENCRYPTION_SECRET.
 * Fails closed if missing or not 32 bytes when decoded from base64.
 */
export function getMasterKey(secretEnv?: string): Buffer {
	const raw = secretEnv ?? process.env.KEY_ENCRYPTION_SECRET;
	if (!raw) {
		throw new Error(
			"KEY_ENCRYPTION_SECRET is not set in the server environment",
		);
	}

	const buf = Buffer.from(raw, "base64");
	if (buf.length !== EXPECTED_KEY_BYTES) {
		throw new Error(
			`KEY_ENCRYPTION_SECRET must be exactly 32 bytes (got ${buf.length})`,
		);
	}

	return buf;
}

export interface EncryptedKeyEnvelope {
	/** Envelope string in v1.<iv>.<tag>.<ciphertext> format (base64url) */
	envelope: string;
	/** User-visible hint derived from plaintext, e.g. "••••a1b2" */
	apiKeyHint: string;
}

/**
 * Derives the masked hint from the plaintext key.
 * Shows up to the last 4 characters preceded by bullet characters.
 */
export function deriveApiKeyHint(plaintext: string): string {
	const trimmed = plaintext.trim();
	if (trimmed.length <= 4) {
		return `••••${trimmed}`;
	}
	return `••••${trimmed.slice(-4)}`;
}

/**
 * Encrypts a plaintext provider key into a versioned AES-256-GCM envelope.
 * Record format: v1.<iv>.<tag>.<ciphertext> (all segments base64url).
 */
export function encryptApiKey(
	plaintext: string,
	masterKey?: Buffer,
): EncryptedKeyEnvelope {
	if (!plaintext) {
		throw new Error("Cannot encrypt empty key");
	}

	const key = masterKey ?? getMasterKey();
	const iv = randomBytes(IV_LENGTH);

	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();

	const envelope = `${FORMAT_PREFIX}.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
	const apiKeyHint = deriveApiKeyHint(plaintext);

	return {
		envelope,
		apiKeyHint,
	};
}

/**
 * Decrypts a versioned AES-256-GCM envelope string.
 * Fails closed if format is invalid or tampering is detected.
 */
export function decryptApiKey(envelope: string, masterKey?: Buffer): string {
	if (!envelope) {
		throw new Error("The stored credential could not be decrypted");
	}

	const parts = envelope.split(".");
	if (parts.length !== 4) {
		throw new Error("The stored credential could not be decrypted");
	}

	const [version, ivB64, tagB64, ciphertextB64] = parts;

	if (version !== FORMAT_PREFIX) {
		throw new Error(
			`The stored credential could not be decrypted (unsupported envelope version: ${version})`,
		);
	}

	const key = masterKey ?? getMasterKey();

	try {
		const iv = Buffer.from(ivB64, "base64url");
		const tag = Buffer.from(tagB64, "base64url");
		const ciphertext = Buffer.from(ciphertextB64, "base64url");

		if (iv.length !== IV_LENGTH) {
			throw new Error("Invalid IV length");
		}

		const decipher = createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(tag);

		const decrypted = Buffer.concat([
			decipher.update(ciphertext),
			decipher.final(),
		]);

		return decrypted.toString("utf8");
	} catch {
		throw new Error("The stored credential could not be decrypted");
	}
}
