import { describe, expect, it } from "vitest";
import {
	decryptApiKey,
	deriveApiKeyHint,
	encryptApiKey,
	getMasterKey,
} from "@/lib/crypto/keys";

describe("AES-256-GCM key envelope (ADR 0004)", () => {
	// Sample 32-byte key: 32 bytes of 'a' base64 encoded
	const validRawSecret = Buffer.alloc(32, "a").toString("base64");
	const validMasterKey = getMasterKey(validRawSecret);

	describe("deriveApiKeyHint", () => {
		it("shows bullet prefix and the last 4 characters", () => {
			expect(deriveApiKeyHint("sk-ant-api03-12345678abcd")).toBe("••••abcd");
			expect(deriveApiKeyHint("short")).toBe("••••hort");
			expect(deriveApiKeyHint("abc")).toBe("••••abc");
		});
	});

	describe("getMasterKey", () => {
		it("throws when missing", () => {
			expect(() => getMasterKey("")).toThrow(
				"KEY_ENCRYPTION_SECRET is not set",
			);
		});

		it("throws when key is not 32 bytes", () => {
			const shortSecret = Buffer.alloc(16, "x").toString("base64");
			expect(() => getMasterKey(shortSecret)).toThrow(
				"must be exactly 32 bytes",
			);
		});

		it("returns a 32-byte buffer when valid", () => {
			const buf = getMasterKey(validRawSecret);
			expect(buf.length).toBe(32);
		});
	});

	describe("encryptApiKey & decryptApiKey", () => {
		it("encrypts and decrypts round-trip correctly", () => {
			const plaintext = "sk-proj-supersecret-api-key-123456789";
			const result = encryptApiKey(plaintext, validMasterKey);

			expect(result.apiKeyHint).toBe("••••6789");
			expect(result.envelope.startsWith("v1.")).toBe(true);

			const parts = result.envelope.split(".");
			expect(parts.length).toBe(4);

			const decrypted = decryptApiKey(result.envelope, validMasterKey);
			expect(decrypted).toBe(plaintext);
		});

		it("produces distinct IV and ciphertext for identical plaintext", () => {
			const plaintext = "same-key-material";
			const first = encryptApiKey(plaintext, validMasterKey);
			const second = encryptApiKey(plaintext, validMasterKey);

			expect(first.envelope).not.toBe(second.envelope);
			expect(decryptApiKey(first.envelope, validMasterKey)).toBe(plaintext);
			expect(decryptApiKey(second.envelope, validMasterKey)).toBe(plaintext);
		});

		it("fails closed on corrupted ciphertext", () => {
			const result = encryptApiKey("my-secret-key", validMasterKey);
			const parts = result.envelope.split(".");
			// Tamper with ciphertext
			parts[3] = Buffer.from("corrupted").toString("base64url");
			const tampered = parts.join(".");

			expect(() => decryptApiKey(tampered, validMasterKey)).toThrow(
				"The stored credential could not be decrypted",
			);
		});

		it("fails closed on wrong master secret", () => {
			const result = encryptApiKey("my-secret-key", validMasterKey);
			const anotherMasterKey = Buffer.alloc(32, "b");

			expect(() => decryptApiKey(result.envelope, anotherMasterKey)).toThrow(
				"The stored credential could not be decrypted",
			);
		});

		it("rejects unsupported envelope versions", () => {
			const result = encryptApiKey("my-secret-key", validMasterKey);
			const parts = result.envelope.split(".");
			parts[0] = "v2";
			const v2Envelope = parts.join(".");

			expect(() => decryptApiKey(v2Envelope, validMasterKey)).toThrow(
				"unsupported envelope version",
			);
		});

		it("rejects malformed envelopes", () => {
			expect(() => decryptApiKey("malformed.envelope", validMasterKey)).toThrow(
				"The stored credential could not be decrypted",
			);
			expect(() => decryptApiKey("", validMasterKey)).toThrow(
				"The stored credential could not be decrypted",
			);
		});
	});
});
