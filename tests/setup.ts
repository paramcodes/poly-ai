import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined") {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		value: (query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		}),
	});

	class MockResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	window.ResizeObserver =
		MockResizeObserver as unknown as typeof ResizeObserver;
	global.ResizeObserver =
		MockResizeObserver as unknown as typeof ResizeObserver;
}
