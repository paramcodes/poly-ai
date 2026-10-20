/**
 * Utility for deterministically extracting clean standalone HTML documents
 * from model output per ADR-0007.
 */

export const FALLBACK_ERROR_DOCUMENT = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview Error</title>
  <style>
    body {
      margin: 0;
      padding: 2rem;
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background-color: #f8fafc;
      color: #334155;
      box-sizing: border-box;
    }
    .card {
      max-width: 28rem;
      padding: 1.5rem;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    h1 {
      font-size: 1.125rem;
      font-weight: 600;
      color: #0f172a;
      margin: 0 0 0.5rem 0;
    }
    p {
      font-size: 0.875rem;
      line-height: 1.5;
      color: #64748b;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>No Preview Available</h1>
    <p>The model did not emit valid HTML to preview.</p>
  </div>
</body>
</html>`;

const FRAGMENT_START_REGEX = /<(?:body|div|main|section|article|header|nav)\b/i;

/**
 * Searches for a complete or streaming raw HTML document starting with
 * `<!DOCTYPE html` or `<html` and extending through the last `</html>`.
 */
function findRawHtml(text: string): string | null {
	const lower = text.toLowerCase();
	const doctypeIndex = lower.indexOf("<!doctype html");
	const htmlIndex = lower.indexOf("<html");

	let startIndex = -1;
	if (doctypeIndex !== -1 && htmlIndex !== -1) {
		startIndex = Math.min(doctypeIndex, htmlIndex);
	} else if (doctypeIndex !== -1) {
		startIndex = doctypeIndex;
	} else if (htmlIndex !== -1) {
		startIndex = htmlIndex;
	}

	if (startIndex === -1) {
		return null;
	}

	const lastHtmlCloseIndex = lower.lastIndexOf("</html>");
	if (lastHtmlCloseIndex !== -1 && lastHtmlCloseIndex >= startIndex) {
		return text.slice(startIndex, lastHtmlCloseIndex + "</html>".length).trim();
	}

	// Active streaming: </html> not yet emitted
	return text.slice(startIndex).trim();
}

/**
 * Extracts an HTML fragment starting with a landmark or container tag (<body, <div, <main, etc.),
 * trimming trailing prose commentary unless tags are actively streaming.
 */
function extractFragment(text: string): string | null {
	const startMatch = FRAGMENT_START_REGEX.exec(text);
	if (!startMatch) {
		return null;
	}

	const candidate = text.slice(startMatch.index).trim();
	const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s+[^>]*)?\/?>/g;
	let match: RegExpExecArray | null = null;
	let lastTagEnd = -1;
	let lastTagIsClosingOrSelfClosing = false;

	while (true) {
		match = tagRegex.exec(candidate);
		if (!match) break;
		const tag = match[0];
		lastTagEnd = tagRegex.lastIndex;
		lastTagIsClosingOrSelfClosing = tag.startsWith("</") || tag.endsWith("/>");
	}

	if (lastTagEnd !== -1 && lastTagIsClosingOrSelfClosing) {
		const afterLastTag = candidate.slice(lastTagEnd);
		if (!/<[a-zA-Z]/i.test(afterLastTag)) {
			return candidate.slice(0, lastTagEnd).trim();
		}
	}

	return candidate;
}

/**
 * Wraps an HTML fragment inside a minimal HTML shell per ADR-0007.
 */
function wrapInHtmlShell(fragment: string): string {
	const trimmed = fragment.trim();
	const bodyMatch = /^<body([^>]*)>([\s\S]*?)<\/body>$/i.exec(trimmed);
	if (bodyMatch) {
		const attrs = bodyMatch[1].trim();
		const inner = bodyMatch[2].trim();
		const bodyOpening = attrs ? `<body ${attrs}>` : "<body>";
		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>
</head>
${bodyOpening}
  ${inner}
</body>
</html>`;
	}

	const openBodyMatch = /^<body([^>]*)>([\s\S]*)$/i.exec(trimmed);
	if (openBodyMatch) {
		const attrs = openBodyMatch[1].trim();
		const inner = openBodyMatch[2].trim();
		const bodyOpening = attrs ? `<body ${attrs}>` : "<body>";
		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>
</head>
${bodyOpening}
  ${inner}
</body>
</html>`;
	}

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>
</head>
<body>
  ${trimmed}
</body>
</html>`;
}

/**
 * Deterministically extracts a standalone HTML document from raw model output.
 *
 * Precedence:
 * 1. Fenced code block (```html or ```htm): extract content of the block.
 * 2. Raw HTML: find first <!DOCTYPE html or <html and extract through last </html>.
 * 3. HTML Fragment: if output contains <body, <div, or <main, wrap in minimal HTML shell.
 * 4. Fallback: minimal error document explaining that the model did not emit valid HTML.
 */
export function extractHtml(rawOutput: string): string {
	if (typeof rawOutput !== "string" || rawOutput.trim().length === 0) {
		return FALLBACK_ERROR_DOCUMENT;
	}

	// 1. Fenced code block (```html or ```htm)
	const fencedBlockRegex = /```(?:html|htm)\b[^\n]*\r?\n?([\s\S]*?)(?:```|$)/gi;
	const matches = Array.from(rawOutput.matchAll(fencedBlockRegex));

	for (const match of matches) {
		const blockContent = match[1].trim();
		if (blockContent.length > 0) {
			const rawDoc = findRawHtml(blockContent);
			if (rawDoc) {
				return rawDoc;
			}

			const fragment = extractFragment(blockContent);
			if (fragment) {
				return wrapInHtmlShell(fragment);
			}

			// If the code block contains pure non-HTML text, fall back to error document
			return FALLBACK_ERROR_DOCUMENT;
		}
	}

	// 2. Raw HTML: find first <!DOCTYPE html or <html through last </html>
	const rawDoc = findRawHtml(rawOutput);
	if (rawDoc) {
		return rawDoc;
	}

	// 3. HTML Fragment: if output contains <body, <div, or <main fragment
	const fragment = extractFragment(rawOutput);
	if (fragment) {
		return wrapInHtmlShell(fragment);
	}

	// 4. Fallback: minimal error document
	return FALLBACK_ERROR_DOCUMENT;
}
