import type { Category } from "./categories";

/**
 * Output modalities supported by models in the models.dev catalogue.
 */
export type OutputModality =
	| "text"
	| "image"
	| "video"
	| "audio"
	| "pdf"
	| string;

/**
 * Maps an array of output modalities to the generation categories it natively supports.
 *
 * Capabilities to category mapping from ADR 0003:
 * - text output -> text, website
 * - image output -> image
 * - video output -> video
 * - audio output -> music
 */
export function modalitiesToCategories(
	outputModalities: OutputModality[] = [],
): Category[] {
	const categories = new Set<Category>();

	for (const mod of outputModalities) {
		const lower = mod.toLowerCase();
		if (lower === "text") {
			categories.add("text");
			categories.add("website");
		} else if (lower === "image") {
			categories.add("image");
		} else if (lower === "video") {
			categories.add("video");
		} else if (lower === "audio") {
			categories.add("music");
		}
	}

	return Array.from(categories);
}

/**
 * The required output modality for each generation category.
 */
export const CATEGORY_REQUIRED_OUTPUT_MODALITY: Record<
	Category,
	OutputModality
> = {
	text: "text",
	website: "text",
	image: "image",
	video: "video",
	music: "audio",
};

/**
 * Checks whether a given model output modalities list satisfies the category requirement.
 */
export function modelSupportsCategory(
	outputModalities: OutputModality[] = [],
	category: Category,
): boolean {
	const supported = modalitiesToCategories(outputModalities);
	return supported.includes(category);
}

/**
 * Returns a capability gating evaluation for assigning a model to a category.
 *
 * If the model natively produces the required modality, compatible is true.
 * If not, compatible is false, and reason describes the missing capability.
 */
export function evaluateCapabilityGating(
	outputModalities: OutputModality[] = [],
	category: Category,
): {
	compatible: boolean;
	requiredModality: OutputModality;
	declaredModalities: OutputModality[];
	warning?: string;
} {
	const requiredModality = CATEGORY_REQUIRED_OUTPUT_MODALITY[category];
	const isCompatible = modelSupportsCategory(outputModalities, category);

	if (isCompatible) {
		return {
			compatible: true,
			requiredModality,
			declaredModalities: outputModalities,
		};
	}

	const declaredStr =
		outputModalities.length > 0 ? outputModalities.join(", ") : "none";
	return {
		compatible: false,
		requiredModality,
		declaredModalities: outputModalities,
		warning: `Model declares output modalities [${declaredStr}], which lacks required "${requiredModality}" for "${category}".`,
	};
}
