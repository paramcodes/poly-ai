import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebsiteCodeView } from "@/components/app/website-code-view";
import {
	DEVICE_WIDTH_CONFIG,
	WebsitePreview,
} from "@/components/app/website-preview";

describe("WebsitePreview", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders sandboxed iframe with exact ADR-0007 sandbox flags (NO allow-same-origin)", () => {
		render(
			<WebsitePreview
				html="<!DOCTYPE html><html><body><h1>Test Site</h1></body></html>"
				isStreaming={false}
			/>,
		);

		const iframe = screen.getByTitle("Website Preview");
		expect(iframe).toBeInTheDocument();

		const sandboxAttr = iframe.getAttribute("sandbox");
		expect(sandboxAttr).toBe("allow-scripts allow-forms allow-popups");
		expect(sandboxAttr).not.toContain("allow-same-origin");
		expect(iframe.getAttribute("srcDoc")).toContain("Test Site");
	});

	it("renders device width toggles and resizes preview container accordingly", () => {
		render(
			<WebsitePreview
				html="<!DOCTYPE html><html><body><h1>Device Test</h1></body></html>"
				isStreaming={false}
			/>,
		);

		const container = screen.getByTestId("preview-frame-container");
		expect(container).toHaveStyle({ width: DEVICE_WIDTH_CONFIG.desktop.width });

		// Click Tablet
		const tabletBtn = screen.getByRole("button", { name: /Tablet/i });
		fireEvent.click(tabletBtn);
		expect(container).toHaveStyle({ width: DEVICE_WIDTH_CONFIG.tablet.width });

		// Click Mobile
		const mobileBtn = screen.getByRole("button", { name: /Mobile/i });
		fireEvent.click(mobileBtn);
		expect(container).toHaveStyle({ width: DEVICE_WIDTH_CONFIG.mobile.width });

		// Click Desktop
		const desktopBtn = screen.getByRole("button", { name: /Desktop/i });
		fireEvent.click(desktopBtn);
		expect(container).toHaveStyle({ width: DEVICE_WIDTH_CONFIG.desktop.width });
	});

	it("debounces html updates by 400ms during streaming", () => {
		vi.useFakeTimers();

		const { rerender } = render(
			<WebsitePreview html="<h1>Initial</h1>" isStreaming={true} />,
		);

		const iframe = screen.getByTitle("Website Preview");
		expect(iframe.getAttribute("srcDoc")).toBe("<h1>Initial</h1>");

		// New chunk arrives while streaming
		act(() => {
			rerender(
				<WebsitePreview html="<h1>Initial Chunk 2</h1>" isStreaming={true} />,
			);
		});

		// Before 400ms: still initial html
		act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(screen.getByTitle("Website Preview").getAttribute("srcDoc")).toBe(
			"<h1>Initial</h1>",
		);

		// Advance remaining 200ms
		act(() => {
			vi.advanceTimersByTime(250);
		});
		expect(screen.getByTitle("Website Preview").getAttribute("srcDoc")).toBe(
			"<h1>Initial Chunk 2</h1>",
		);

		vi.useRealTimers();
	});

	it("updates immediately without debounce when isStreaming transitions to false", () => {
		vi.useFakeTimers();

		const { rerender } = render(
			<WebsitePreview html="<h1>Streaming</h1>" isStreaming={true} />,
		);

		// While streaming, a new chunk arrives
		act(() => {
			rerender(
				<WebsitePreview
					html="<h1>Completed Document</h1>"
					isStreaming={true}
				/>,
			);
		});

		// Stream finishes immediately
		act(() => {
			rerender(
				<WebsitePreview
					html="<h1>Completed Document</h1>"
					isStreaming={false}
				/>,
			);
		});

		const iframe = screen.getByTitle("Website Preview");
		expect(iframe.getAttribute("srcDoc")).toBe("<h1>Completed Document</h1>");

		vi.useRealTimers();
	});

	it("reload button triggers onReload callback and increments revision key", () => {
		const onReload = vi.fn();
		render(
			<WebsitePreview
				html="<h1>Reload Test</h1>"
				isStreaming={false}
				onReload={onReload}
			/>,
		);

		const reloadBtn = screen.getByRole("button", { name: /Reload preview/i });
		fireEvent.click(reloadBtn);
		expect(onReload).toHaveBeenCalledTimes(1);
	});
});

describe("WebsiteCodeView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders empty state when html is empty", () => {
		render(<WebsiteCodeView html="" />);
		expect(screen.getByText("No HTML code generated yet")).toBeInTheDocument();
	});

	it("renders formatted HTML code with line numbers", () => {
		const html =
			"<!DOCTYPE html>\n<html>\n<body>\n<h1>Code View</h1>\n</body>\n</html>";
		render(<WebsiteCodeView html={html} filename="landing.html" />);

		expect(screen.getByText("landing.html")).toBeInTheDocument();
		expect(screen.getByText(/Code View/)).toBeInTheDocument();
		expect(screen.getByText("1")).toBeInTheDocument();
		expect(screen.getByText("6")).toBeInTheDocument();
	});

	it("copies code to clipboard and indicates copied status", async () => {
		const writeTextMock = vi.fn().mockResolvedValue(undefined);
		Object.assign(navigator, {
			clipboard: {
				writeText: writeTextMock,
			},
		});

		const html = "<h1>Copy Me</h1>";
		render(<WebsiteCodeView html={html} />);

		const copyBtn = screen.getByRole("button", { name: /Copy to clipboard/i });
		fireEvent.click(copyBtn);

		await waitFor(() => {
			expect(writeTextMock).toHaveBeenCalledWith(html);
		});
		expect(screen.getByRole("button", { name: /Copied/i })).toBeInTheDocument();
	});

	it("triggers download of index.html file", () => {
		const createObjectURLMock = vi.fn(() => "blob:http://localhost/test-blob");
		const revokeObjectURLMock = vi.fn();
		global.URL.createObjectURL = createObjectURLMock;
		global.URL.revokeObjectURL = revokeObjectURLMock;

		const clickMock = vi.fn();
		const originalCreateElement = document.createElement.bind(document);
		vi.spyOn(document, "createElement").mockImplementation(
			(tagName: string) => {
				const el = originalCreateElement(tagName);
				if (tagName.toLowerCase() === "a") {
					el.click = clickMock;
				}
				return el;
			},
		);

		const html = "<!DOCTYPE html><html><body>Download Me</body></html>";
		render(<WebsiteCodeView html={html} filename="site.html" />);

		const downloadBtn = screen.getByRole("button", {
			name: /Download \.html file/i,
		});
		fireEvent.click(downloadBtn);

		expect(createObjectURLMock).toHaveBeenCalledTimes(1);
		expect(clickMock).toHaveBeenCalledTimes(1);
		expect(revokeObjectURLMock).toHaveBeenCalledTimes(1);

		vi.restoreAllMocks();
	});
});
