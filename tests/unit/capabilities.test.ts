import { describe, expect, it } from "vitest";
import {
	CATEGORY_REQUIRED_OUTPUT_MODALITY,
	evaluateCapabilityGating,
	modalitiesToCategories,
	modelSupportsCategory,
} from "../../src/lib/capabilities";

describe("capabilities", () => {
	describe("modalitiesToCategories", () => {
		it("maps text output to text and website categories", () => {
			expect(modalitiesToCategories(["text"])).toEqual(["text", "website"]);
		});

		it("maps image output to image category", () => {
			expect(modalitiesToCategories(["image"])).toEqual(["image"]);
		});

		it("maps video output to video category", () => {
			expect(modalitiesToCategories(["video"])).toEqual(["video"]);
		});

		it("maps audio output to music category", () => {
			expect(modalitiesToCategories(["audio"])).toEqual(["music"]);
		});

		it("handles multiple output modalities", () => {
			const categories = modalitiesToCategories(["text", "image", "audio"]);
			expect(categories).toContain("text");
			expect(categories).toContain("website");
			expect(categories).toContain("image");
			expect(categories).toContain("music");
			expect(categories).not.toContain("video");
		});

		it("handles empty or unknown modalities", () => {
			expect(modalitiesToCategories([])).toEqual([]);
			expect(modalitiesToCategories(["pdf", "unknown"])).toEqual([]);
		});
	});

	describe("modelSupportsCategory", () => {
		it("correctly identifies supported and unsupported categories", () => {
			expect(modelSupportsCategory(["text"], "text")).toBe(true);
			expect(modelSupportsCategory(["text"], "website")).toBe(true);
			expect(modelSupportsCategory(["text"], "image")).toBe(false);

			expect(modelSupportsCategory(["image"], "image")).toBe(true);
			expect(modelSupportsCategory(["image"], "text")).toBe(false);

			expect(modelSupportsCategory(["video"], "video")).toBe(true);
			expect(modelSupportsCategory(["audio"], "music")).toBe(true);
		});
	});

	describe("evaluateCapabilityGating", () => {
		it("returns compatible for matching modalities", () => {
			const res = evaluateCapabilityGating(["text"], "text");
			expect(res.compatible).toBe(true);
			expect(res.requiredModality).toBe("text");
			expect(res.warning).toBeUndefined();
		});

		it("returns warning and missing modality when incompatible", () => {
			const res = evaluateCapabilityGating(["text"], "image");
			expect(res.compatible).toBe(false);
			expect(res.requiredModality).toBe("image");
			expect(res.warning).toContain('lacks required "image" for "image"');
		});
	});

	describe("CATEGORY_REQUIRED_OUTPUT_MODALITY", () => {
		it("matches expected required modalities from ADR 0003", () => {
			expect(CATEGORY_REQUIRED_OUTPUT_MODALITY.text).toBe("text");
			expect(CATEGORY_REQUIRED_OUTPUT_MODALITY.website).toBe("text");
			expect(CATEGORY_REQUIRED_OUTPUT_MODALITY.image).toBe("image");
			expect(CATEGORY_REQUIRED_OUTPUT_MODALITY.video).toBe("video");
			expect(CATEGORY_REQUIRED_OUTPUT_MODALITY.music).toBe("audio");
		});
	});
});
