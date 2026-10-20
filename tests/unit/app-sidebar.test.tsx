import { fireEvent, render, screen } from "@testing-library/react";
import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppLayout from "../../src/app/app/layout";
import AppPage from "../../src/app/app/page";
import { AppHeader } from "../../src/components/app/app-header";
import { AppSidebar } from "../../src/components/app/app-sidebar";
import { SidebarProvider } from "../../src/components/ui/sidebar";
import { TooltipProvider } from "../../src/components/ui/tooltip";
import { authClient } from "../../src/lib/auth-client";
import { CATEGORIES, CATEGORY_META } from "../../src/lib/categories";

const mockUsePathname = vi.fn();
const mockRedirect = vi.fn();
const mockCookieGet = vi.fn();

vi.mock("next/headers", () => ({
	cookies: async () => ({
		get: (name: string) => mockCookieGet(name),
	}),
}));

vi.mock("next/navigation", () => ({
	usePathname: () => mockUsePathname(),
	redirect: (url: string) => mockRedirect(url),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		useSession: vi.fn(),
		signOut: vi.fn(),
	},
}));

function renderWithProviders(ui: React.ReactElement) {
	return render(
		<TooltipProvider>
			<SidebarProvider>{ui}</SidebarProvider>
		</TooltipProvider>,
	);
}

describe("AppSidebar", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUsePathname.mockReturnValue("/app/text");
		vi.mocked(authClient.useSession).mockReturnValue({
			data: {
				user: {
					id: "usr_1",
					name: "Alice Doe",
					email: "alice@example.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				session: {
					id: "ses_1",
					userId: "usr_1",
					token: "tok_1",
					expiresAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			},
			isPending: false,
			error: null,
		} as never);
	});

	it("renders brand logo linking to /app/text", () => {
		renderWithProviders(<AppSidebar />);
		const brandLink = screen.getByRole("link", { name: /poly-ai/i });
		expect(brandLink).toHaveAttribute("href", "/app/text");
	});

	it("renders all five categories with correct links and labels", () => {
		renderWithProviders(<AppSidebar />);

		for (const category of CATEGORIES) {
			const meta = CATEGORY_META[category];
			const link = screen.getByRole("link", { name: meta.name });
			expect(link).toBeInTheDocument();
			expect(link).toHaveAttribute("href", `/app/${category}`);
		}
	});

	it("sets active state on currently active category button", () => {
		mockUsePathname.mockReturnValue("/app/video");
		renderWithProviders(<AppSidebar />);

		const videoLink = screen.getByRole("link", { name: "Video" });
		const textLink = screen.getByRole("link", { name: "Text" });

		expect(videoLink).toHaveAttribute("data-active", "true");
		expect(textLink).toHaveAttribute("data-active", "false");
	});

	it("renders link to Providers & Models in footer", () => {
		renderWithProviders(<AppSidebar />);
		const settingsLink = screen.getByRole("link", {
			name: /providers & models/i,
		});
		expect(settingsLink).toHaveAttribute("href", "/settings/providers");
	});

	it("displays user name and email from session", () => {
		renderWithProviders(<AppSidebar />);
		expect(screen.getByText("Alice Doe")).toBeInTheDocument();
		expect(screen.getByText("alice@example.com")).toBeInTheDocument();
	});

	it("calls authClient.signOut when clicking sign-out button", () => {
		renderWithProviders(<AppSidebar />);
		const signOutButton = screen.getByRole("button", { name: /sign out/i });
		fireEvent.click(signOutButton);

		expect(authClient.signOut).toHaveBeenCalledWith({
			fetchOptions: {
				onSuccess: expect.any(Function),
			},
		});
	});

	it("falls back to 'Account' when no user session is present", () => {
		vi.mocked(authClient.useSession).mockReturnValue({
			data: null,
			isPending: false,
			error: null,
		} as never);

		renderWithProviders(<AppSidebar />);
		expect(screen.getByText("Account")).toBeInTheDocument();
	});

	it("displays user email as display name when user has no name", () => {
		vi.mocked(authClient.useSession).mockReturnValue({
			data: {
				user: {
					id: "usr_2",
					name: "",
					email: "bob@example.com",
					emailVerified: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				session: {
					id: "ses_2",
					userId: "usr_2",
					token: "tok_2",
					expiresAt: new Date(),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			},
			isPending: false,
			error: null,
		} as never);

		renderWithProviders(<AppSidebar />);
		expect(screen.getByText("bob@example.com")).toBeInTheDocument();
	});
});

describe("AppHeader", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders category title according to active pathname", () => {
		mockUsePathname.mockReturnValue("/app/image");
		renderWithProviders(<AppHeader />);

		expect(screen.getByText("Image")).toBeInTheDocument();
		expect(screen.getByText("Poly-AI")).toBeInTheDocument();
	});

	it("renders Providers & Models title for settings pathname", () => {
		mockUsePathname.mockReturnValue("/settings/providers");
		renderWithProviders(<AppHeader />);

		expect(screen.getByText("Providers & Models")).toBeInTheDocument();
	});

	it("renders sidebar trigger button", () => {
		mockUsePathname.mockReturnValue("/app/text");
		renderWithProviders(<AppHeader />);

		const trigger = screen.getByRole("button", { name: /toggle sidebar/i });
		expect(trigger).toBeInTheDocument();
	});

	it("renders fallback Dashboard title for default route", () => {
		mockUsePathname.mockReturnValue("/app");
		renderWithProviders(<AppHeader />);

		expect(screen.getByText("Dashboard")).toBeInTheDocument();
	});
});

describe("AppPage", () => {
	it("redirects /app to /app/text", () => {
		AppPage();
		expect(mockRedirect).toHaveBeenCalledWith("/app/text");
	});
});

describe("AppLayout", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUsePathname.mockReturnValue("/app/text");
		mockCookieGet.mockReturnValue(undefined);
		vi.mocked(authClient.useSession).mockReturnValue({
			data: null,
			isPending: false,
			error: null,
		} as never);
	});

	it("renders layout shell with children and default open when cookie is not set", async () => {
		const layout = await AppLayout({
			children: <div data-testid="test-child">Child Content</div>,
		});

		render(<TooltipProvider>{layout}</TooltipProvider>);
		expect(screen.getByTestId("test-child")).toBeInTheDocument();
		expect(screen.getByText("Child Content")).toBeInTheDocument();
	});

	it("respects collapsed state when sidebar_state cookie is false", async () => {
		mockCookieGet.mockReturnValue({ value: "false" });

		const layout = await AppLayout({
			children: <div data-testid="collapsed-child">Collapsed Content</div>,
		});

		render(<TooltipProvider>{layout}</TooltipProvider>);
		expect(screen.getByTestId("collapsed-child")).toBeInTheDocument();
	});
});
