"use client";

import {
	Clapperboard,
	Code2,
	ImageIcon,
	LogOut,
	Music2,
	Settings,
	Type,
	User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type * as React from "react";
import { ShortcutsDialog } from "@/components/app/shortcuts-dialog";
import { ThemeToggle } from "@/components/landing/theme-toggle";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import {
	CATEGORY_META,
	type Category,
	SIDEBAR_CATEGORIES,
} from "@/lib/categories";

const CATEGORY_ICONS: Record<
	Category,
	React.ComponentType<{ className?: string }>
> = {
	text: Type,
	image: ImageIcon,
	video: Clapperboard,
	music: Music2,
	website: Code2,
};

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
	const pathname = usePathname() || "";
	const { data: session } = authClient.useSession();
	const user = session?.user;

	const displayName = user?.name || user?.email || "Account";
	const displayEmail =
		user?.name && user?.email && user.name !== user.email ? user.email : null;

	const handleSignOut = () => {
		authClient.signOut({
			fetchOptions: {
				onSuccess: () => {
					window.location.href = "/sign-in";
				},
			},
		});
	};

	return (
		<Sidebar collapsible="icon" {...props}>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild tooltip="Poly-AI">
							<Link href="/app/text">
								<span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand">
									<span className="size-2 rounded-[2px] bg-white" />
								</span>
								<span className="font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
									Poly-AI
								</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Categories</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{SIDEBAR_CATEGORIES.map((category) => {
								const meta = CATEGORY_META[category];
								const Icon = CATEGORY_ICONS[category];
								const href = `/app/${category}`;
								const isActive =
									pathname === href || pathname.startsWith(`${href}/`);

								return (
									<SidebarMenuItem key={category}>
										<SidebarMenuButton
											asChild
											isActive={isActive}
											tooltip={meta.name}
										>
											<Link href={href}>
												<Icon className="size-4 shrink-0" />
												<span>{meta.name}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							asChild
							isActive={
								pathname === "/settings/providers" ||
								pathname.startsWith("/settings/providers/")
							}
							tooltip="Providers & Models"
						>
							<Link href="/settings/providers">
								<Settings className="size-4 shrink-0" />
								<span>Providers & Models</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton
							tooltip="Sign out"
							onClick={handleSignOut}
							aria-label="Sign out"
						>
							<LogOut className="size-4 shrink-0" />
							<span>Sign out</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>

				<div className="flex items-center justify-between gap-2 border-t border-sidebar-border px-2 pt-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
					<div className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden">
						<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-[11px] font-semibold text-sidebar-primary-foreground">
							{displayName ? (
								displayName.charAt(0).toUpperCase()
							) : (
								<UserIcon className="size-3.5" />
							)}
						</div>
						<div className="flex min-w-0 flex-col">
							<span className="truncate text-xs font-medium text-sidebar-foreground">
								{displayName}
							</span>
							{displayEmail ? (
								<span className="truncate text-[10px] text-muted-foreground">
									{displayEmail}
								</span>
							) : null}
						</div>
					</div>
					<div className="flex items-center gap-1">
						<ShortcutsDialog />
						<ThemeToggle />
					</div>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}
