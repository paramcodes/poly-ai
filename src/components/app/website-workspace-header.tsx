"use client";

import {
	Check,
	Copy,
	Download,
	Eye,
	FileCode,
	Monitor,
	RotateCcw,
	Smartphone,
	Tablet,
} from "lucide-react";
import type { DeviceWidth } from "@/components/app/website-preview";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface WebsiteWorkspaceHeaderProps {
	activeTab: string;
	deviceWidth: DeviceWidth;
	onDeviceWidthChange: (width: DeviceWidth) => void;
	onReload: () => void;
	onCopy: () => void;
	onDownload: () => void;
	hasHtml: boolean;
	copied: boolean;
}

export function WebsiteWorkspaceHeader({
	activeTab,
	deviceWidth,
	onDeviceWidthChange,
	onReload,
	onCopy,
	onDownload,
	hasHtml,
	copied,
}: WebsiteWorkspaceHeaderProps) {
	return (
		<div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
			<TabsList className="h-8">
				<TabsTrigger value="preview" className="h-7 text-xs px-2.5">
					<Eye className="mr-1.5 size-3.5" />
					Preview
				</TabsTrigger>
				<TabsTrigger value="code" className="h-7 text-xs px-2.5">
					<FileCode className="mr-1.5 size-3.5" />
					Code
				</TabsTrigger>
			</TabsList>

			<div className="flex items-center gap-2">
				{/* Device width toggles (Desktop, Tablet, Mobile) */}
				{activeTab === "preview" && (
					<div className="flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
						<Button
							type="button"
							variant={deviceWidth === "desktop" ? "secondary" : "ghost"}
							size="sm"
							onClick={() => onDeviceWidthChange("desktop")}
							aria-label="Desktop (1280px)"
							className="h-7 px-2 text-xs font-medium"
						>
							<Monitor className="mr-1 size-3.5" />
							Desktop
						</Button>
						<Button
							type="button"
							variant={deviceWidth === "tablet" ? "secondary" : "ghost"}
							size="sm"
							onClick={() => onDeviceWidthChange("tablet")}
							aria-label="Tablet (768px)"
							className="h-7 px-2 text-xs font-medium"
						>
							<Tablet className="mr-1 size-3.5" />
							Tablet
						</Button>
						<Button
							type="button"
							variant={deviceWidth === "mobile" ? "secondary" : "ghost"}
							size="sm"
							onClick={() => onDeviceWidthChange("mobile")}
							aria-label="Mobile (390px)"
							className="h-7 px-2 text-xs font-medium"
						>
							<Smartphone className="mr-1 size-3.5" />
							Mobile
						</Button>
					</div>
				)}

				{/* Action buttons (Reload, Copy, Download) */}
				<div className="flex items-center gap-1">
					{activeTab === "preview" && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onReload}
							aria-label="Reload preview"
							title="Reload preview"
							className="h-7 px-2 text-xs"
						>
							<RotateCcw className="size-3.5 mr-1" />
							Reload
						</Button>
					)}

					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onCopy}
						disabled={!hasHtml}
						aria-label={copied ? "Copied" : "Copy to clipboard"}
						className="h-7 px-2 text-xs"
					>
						{copied ? (
							<Check className="mr-1 size-3 text-green-500" />
						) : (
							<Copy className="mr-1 size-3" />
						)}
						{copied ? "Copied" : "Copy"}
					</Button>

					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={onDownload}
						disabled={!hasHtml}
						aria-label="Download .html file"
						className="h-7 px-2 text-xs"
					>
						<Download className="mr-1 size-3" />
						Download
					</Button>
				</div>
			</div>
		</div>
	);
}
