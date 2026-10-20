import { describe, expect, it } from "vitest";
import {
	extractHtml,
	FALLBACK_ERROR_DOCUMENT,
} from "../../src/lib/website/extract-html";

describe("extractHtml", () => {
	describe("fenced code blocks", () => {
		it("extracts html document from ```html block with prose before and after", () => {
			const raw = `Here is the website you requested:

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Preview Test</title>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>
\`\`\`

I hope you like this layout! Let me know if you want changes.`;

			const result = extractHtml(raw);
			expect(result).toBe(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Preview Test</title>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>`);
		});

		it("extracts html document from case-insensitive ```HTML block with attributes", () => {
			const raw = `\`\`\`HTML title="index.html"
<!DOCTYPE html>
<html>
<head><title>Case Insensitive</title></head>
<body><p>Uppercase fence</p></body>
</html>
\`\`\``;

			const result = extractHtml(raw);
			expect(result).toContain("<title>Case Insensitive</title>");
			expect(result).not.toContain("```");
		});

		it("extracts html document from ```htm block", () => {
			const raw = `Here is your page:
\`\`\`htm
<!DOCTYPE html>
<html>
<head><title>Htm Extension</title></head>
<body><p>Short extension test</p></body>
</html>
\`\`\``;

			const result = extractHtml(raw);
			expect(result).toBe(`<!DOCTYPE html>
<html>
<head><title>Htm Extension</title></head>
<body><p>Short extension test</p></body>
</html>`);
		});

		it("strips commentary preceding <!DOCTYPE inside a fenced block", () => {
			const raw = `\`\`\`html
Here is the code you wanted:
<!DOCTYPE html>
<html>
<body><main>Main Content</main></body>
</html>
\`\`\``;

			const result = extractHtml(raw);
			expect(result).toBe(`<!DOCTYPE html>
<html>
<body><main>Main Content</main></body>
</html>`);
		});
	});

	describe("unfenced raw html", () => {
		it("extracts document starting with <!DOCTYPE html> and ending with </html> with prose before and after", () => {
			const raw = `Sure! Here is the complete code:
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Unfenced Doctype</title>
</head>
<body>
  <p>No code fences used</p>
</body>
</html>
Enjoy your page!`;

			const result = extractHtml(raw);
			expect(result).toBe(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Unfenced Doctype</title>
</head>
<body>
  <p>No code fences used</p>
</body>
</html>`);
		});

		it("extracts document starting with <html> and ending with </html>", () => {
			const raw = `Here is the output:
<html lang="en">
<head><title>No Doctype</title></head>
<body><h1>Just Html Tag</h1></body>
</html>
That is all.`;

			const result = extractHtml(raw);
			expect(result).toBe(`<html lang="en">
<head><title>No Doctype</title></head>
<body><h1>Just Html Tag</h1></body>
</html>`);
		});

		it("strips generic code fences without language tag around raw html", () => {
			const raw = `\`\`\`
<!DOCTYPE html>
<html>
<body><p>Generic fence</p></body>
</html>
\`\`\``;

			const result = extractHtml(raw);
			expect(result).toBe(`<!DOCTYPE html>
<html>
<body><p>Generic fence</p></body>
</html>`);
		});
	});

	describe("html fragments", () => {
		it('wraps fragment with <div class="hero">...</div> in minimal html shell', () => {
			const raw = `Here is the hero component:
<div class="hero">
  <h1>Welcome to Poly-AI</h1>
  <p>Build anything.</p>
</div>
Let me know if you need any adjustments!`;

			const result = extractHtml(raw);
			expect(result).toContain("<!DOCTYPE html>");
			expect(result).toContain('<html lang="en">');
			expect(result).toContain('<meta charset="utf-8" />');
			expect(result).toContain(
				'<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
			);
			expect(result).toContain("<title>Preview</title>");
			expect(result).toContain('<div class="hero">');
			expect(result).toContain("Welcome to Poly-AI");
			expect(result).not.toContain("Here is the hero component:");
			expect(result).not.toContain("Let me know if you need any adjustments!");
		});

		it("wraps fragment inside ```html fenced block in minimal html shell", () => {
			const raw = `\`\`\`html
<div class="hero">
  <h2>Fenced Fragment</h2>
</div>
\`\`\``;

			const result = extractHtml(raw);
			expect(result).toContain("<!DOCTYPE html>");
			expect(result).toContain('<div class="hero">');
			expect(result).toContain("Fenced Fragment");
		});

		it("wraps <main> fragment in minimal html shell", () => {
			const raw = `<main class="container">
  <h1>Main Landmark</h1>
</main>`;

			const result = extractHtml(raw);
			expect(result).toContain("<!DOCTYPE html>");
			expect(result).toContain('<main class="container">');
		});

		it("handles <body> fragment by preserving body attributes", () => {
			const raw = `<body class="dark bg-black text-white">
  <h1>Dark Mode Page</h1>
</body>`;

			const result = extractHtml(raw);
			expect(result).toContain("<!DOCTYPE html>");
			expect(result).toContain('<body class="dark bg-black text-white">');
			expect(result).toContain("Dark Mode Page");
			expect(result.match(/<body/gi)?.length).toBe(1);
		});
	});

	describe("incomplete streaming chunks", () => {
		it("handles unclosed fenced html block during active stream", () => {
			const streamChunk = `Here is the site:
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Streaming</title>
</head>
<body>
  <div class="app">
    <h1>Generating content...`;

			const result = extractHtml(streamChunk);
			expect(result).toContain("<!DOCTYPE html>");
			expect(result).toContain("<h1>Generating content...");
			expect(result).not.toContain("Here is the site:");
		});

		it("handles unfenced raw html document during active stream", () => {
			const streamChunk = `<!DOCTYPE html>
<html>
<head><title>Stream Raw</title></head>
<body>
  <p>Streaming unfenced`;

			const result = extractHtml(streamChunk);
			expect(result).toContain("<!DOCTYPE html>");
			expect(result).toContain("<p>Streaming unfenced");
		});

		it("handles streaming fragment without closing tags", () => {
			const streamChunk = `<div class="hero">
  <h1>Building live`;

			const result = extractHtml(streamChunk);
			expect(result).toContain("<!DOCTYPE html>");
			expect(result).toContain('<div class="hero">');
			expect(result).toContain("<h1>Building live");
		});

		it("handles early stream with just opening fence gracefully", () => {
			const streamChunk = "```html\n";
			const result = extractHtml(streamChunk);
			expect(result).toBe(FALLBACK_ERROR_DOCUMENT);
		});

		it("handles stream chunk with incomplete doctype", () => {
			const streamChunk = "<!DOC";
			const result = extractHtml(streamChunk);
			expect(result).toBe(FALLBACK_ERROR_DOCUMENT);
		});
	});

	describe("fallback error document", () => {
		it("returns fallback error document for pure prose with no html", () => {
			const prose =
				"I cannot generate this website because of content policies.";
			const result = extractHtml(prose);
			expect(result).toBe(FALLBACK_ERROR_DOCUMENT);
			expect(result).toContain("<!DOCTYPE html>");
			expect(result).toContain("did not emit valid HTML");
		});

		it("returns fallback error document for empty or whitespace strings", () => {
			expect(extractHtml("")).toBe(FALLBACK_ERROR_DOCUMENT);
			expect(extractHtml("   \n\t  ")).toBe(FALLBACK_ERROR_DOCUMENT);
		});

		it("returns fallback error document for non-string inputs safely", () => {
			expect(extractHtml(undefined as unknown as string)).toBe(
				FALLBACK_ERROR_DOCUMENT,
			);
			expect(extractHtml(null as unknown as string)).toBe(
				FALLBACK_ERROR_DOCUMENT,
			);
		});

		it("returns fallback error document for code block containing pure non-html prose", () => {
			const raw = `\`\`\`html
This is just explanation prose inside an html code block without any actual html tags.
\`\`\``;
			const result = extractHtml(raw);
			expect(result).toBe(FALLBACK_ERROR_DOCUMENT);
		});
	});
});
