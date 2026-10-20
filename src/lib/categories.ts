/**
 * The five generation categories.
 *
 * This module is the single source of truth for what a category *is*. The
 * sidebar, the routes, the model catalogue filter and the empty-state messages
 * all read from here, so a category can never drift between surfaces.
 *
 * See `docs/adr/0003-models-dev-as-model-catalogue.md` for how a model's
 * capabilities are derived from the catalogue and mapped onto these
 * categories.
 */

export const CATEGORIES = [
	"text",
	"image",
	"video",
	"music",
	"website",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: unknown): value is Category {
	return (
		typeof value === "string" &&
		(CATEGORIES as readonly string[]).includes(value)
	);
}

export interface CategoryMeta {
	key: Category;
	/** Display name, singular. */
	name: string;
	/** Display name used in sentences, plural. */
	namePlural: string;
	/** One-line description of what the category produces. */
	description: string;
	/**
	 * How many models in the upstream catalogue (models.dev) support this
	 * capability. Shown as context on the launcher; the real number for a
	 * signed-in user is how many *their* providers expose.
	 */
	catalogueSize: string;
	/** The capability a model must declare to be assigned to this category. */
	requiredCapability: Capability;
}

/**
 * Capabilities a model can declare. These mirror the `modalities.output` field
 * of the models.dev catalogue.
 */
export type Capability =
	| "text"
	| "image"
	| "video"
	| "audio"
	| "toolCall"
	| "reasoning"
	| "attachment";

export const CATEGORY_META: Record<Category, CategoryMeta> = {
	text: {
		key: "text",
		name: "Text",
		namePlural: "Text models",
		description:
			"Stream answers, summaries and code from any chat model you have configured.",
		catalogueSize: "8,710 models",
		requiredCapability: "text",
	},
	image: {
		key: "image",
		name: "Image",
		namePlural: "Image models",
		description:
			"Generate and edit stills from image-capable models across every provider.",
		catalogueSize: "101 models",
		requiredCapability: "image",
	},
	video: {
		key: "video",
		name: "Video",
		namePlural: "Video models",
		description:
			"Queue long video jobs that keep running even when a request times out.",
		catalogueSize: "73 models",
		requiredCapability: "video",
	},
	music: {
		key: "music",
		name: "Music",
		namePlural: "Music models",
		description:
			"Songs and voice from audio-capable models, including asynchronous queues.",
		catalogueSize: "47 models",
		requiredCapability: "audio",
	},
	website: {
		key: "website",
		name: "Website",
		namePlural: "Website models",
		description:
			"Ship a self-contained HTML document and watch it render live beside the prompt.",
		catalogueSize: "text models",
		requiredCapability: "text",
	},
};

/** Categories in the order the sidebar lists them. */
export const SIDEBAR_CATEGORIES: Category[] = [...CATEGORIES];
