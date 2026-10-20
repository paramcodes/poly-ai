"use client";

import { Monitor, RotateCcw, Smartphone, Tablet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export type DeviceWidth = "desktop" | "tablet" | "mobile";

export const DEVICE_WIDTH_CONFIG: Record<
	DeviceWidth,
	{ label: string; width: string; widthPx: number }
> = {
	desktop: { label: "Desktop", width: "1280px", widthPx: 1280 },
	tablet: { label: "Tablet", width: "768px", widthPx: 768 },
	mobile: { label: "Mobile", width: "390px", widthPx: 390 },
};

export interface WebsitePreviewProps {
	html: string;
	isStreaming: boolean;
	generationKey?: string;
	deviceWidth?: DeviceWidth;
	onDeviceWidthChange?: (width: DeviceWidth) => void;
	showControls?: boolean;
	onReload?: () => void;
	reloadKey?: number;
	className?: string;
}

export function WebsitePreview({
	html,
	isStreaming,
	generationKey,
	deviceWidth: controlledDeviceWidth,
	onDeviceWidthChange,
	showControls = true,
	onReload,
	reloadKey,
	className,
}: WebsitePreviewProps) {
	const [internalDeviceWidth, setInternalDeviceWidth] =
		useState<DeviceWidth>("desktop");
	const deviceWidth = controlledDeviceWidth ?? internalDeviceWidth;

	const handleDeviceWidthChange = useCallback(
		(width: DeviceWidth) => {
			setInternalDeviceWidth(width);
			onDeviceWidthChange?.(width);
		},
		[onDeviceWidthChange],
	);

	const [debouncedHtml, setDebouncedHtml] = useState(html);
	const [revision, setRevision] = useState(1);
	const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);
	const wasStreamingRef = useRef(isStreaming);
	const lastAppliedHtmlRef = useRef(html);
	const latestHtmlRef = useRef(html);
	const prevGenKeyRef = useRef(generationKey);

	latestHtmlRef.current = html;

	const handleReload = useCallback(() => {
		setRevision((prev) => prev + 1);
		onReload?.();
	}, [onReload]);

	// React to external reloadKey changes
	const prevReloadKeyRef = useRef(reloadKey);
	useEffect(() => {
		if (
			reloadKey !== undefined &&
			prevReloadKeyRef.current !== undefined &&
			reloadKey !== prevReloadKeyRef.current
		) {
			setRevision((prev) => prev + 1);
		}
		prevReloadKeyRef.current = reloadKey;
	}, [reloadKey]);

	// React to generationKey changes
	useEffect(() => {
		if (
			generationKey !== undefined &&
			prevGenKeyRef.current !== undefined &&
			generationKey !== prevGenKeyRef.current
		) {
			clearTimeout(timerRef.current);
			timerRef.current = undefined;
			setDebouncedHtml(html);
			setRevision((prev) => prev + 1);
			lastAppliedHtmlRef.current = html;
		}
		prevGenKeyRef.current = generationKey;
	}, [generationKey, html]);

	// Handle streaming and debouncing (400ms during streaming, immediate on finish)
	useEffect(() => {
		const wasStreaming = wasStreamingRef.current;
		wasStreamingRef.current = isStreaming;
		// 1. Transitioned from streaming to completed: immediate update
		if (wasStreaming && !isStreaming) {
			clearTimeout(timerRef.current);
			timerRef.current = undefined;
			if (html !== lastAppliedHtmlRef.current) {
				setDebouncedHtml(html);
				setRevision((prev) => prev + 1);
				lastAppliedHtmlRef.current = html;
			}
			return;
		}

		// 2. Currently streaming: debounce by 400ms
		if (isStreaming) {
			clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => {
				const next = latestHtmlRef.current;
				if (next !== lastAppliedHtmlRef.current) {
					setDebouncedHtml(next);
					setRevision((prev) => prev + 1);
					lastAppliedHtmlRef.current = next;
				}
				timerRef.current = undefined;
			}, 400);
			return;
		}

		// 3. Not streaming: immediate update when html changes
		if (!isStreaming && html !== lastAppliedHtmlRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = undefined;
			setDebouncedHtml(html);
			setRevision((prev) => prev + 1);
			lastAppliedHtmlRef.current = html;
		}
	}, [html, isStreaming]);

	useEffect(() => {
		return () => {
			clearTimeout(timerRef.current);
		};
	}, []);

	return (
		<div
			className={`relative flex h-full w-full flex-col overflow-hidden bg-muted/20 ${className ?? ""}`}
			data-testid="website-preview"
		>
			{showControls && (
				<div className="flex items-center justify-between border-b bg-background/80 px-3 py-2 backdrop-blur-xs">
					<div className="flex items-center gap-1 rounded-md border bg-muted/40 p-0.5">
						<Button
							type="button"
							variant={deviceWidth === "desktop" ? "secondary" : "ghost"}
							size="sm"
							onClick={() => handleDeviceWidthChange("desktop")}
							aria-label="Desktop (1280px)"
							className="h-7 px-2.5 text-xs font-medium"
						>
							<Monitor className="mr-1.5 size-3.5" />
							Desktop
						</Button>
						<Button
							type="button"
							variant={deviceWidth === "tablet" ? "secondary" : "ghost"}
							size="sm"
							onClick={() => handleDeviceWidthChange("tablet")}
							aria-label="Tablet (768px)"
							className="h-7 px-2.5 text-xs font-medium"
						>
							<Tablet className="mr-1.5 size-3.5" />
							Tablet
						</Button>
						<Button
							type="button"
							variant={deviceWidth === "mobile" ? "secondary" : "ghost"}
							size="sm"
							onClick={() => handleDeviceWidthChange("mobile")}
							aria-label="Mobile (390px)"
							className="h-7 px-2.5 text-xs font-medium"
						>
							<Smartphone className="mr-1.5 size-3.5" />
							Mobile
						</Button>
					</div>

					<div className="flex items-center gap-1.5">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleReload}
							aria-label="Reload preview"
							title="Reload preview"
							className="h-7 px-2 text-xs"
						>
							<RotateCcw className="size-3.5 mr-1.5" />
							Reload
						</Button>
					</div>
				</div>
			)}

			<div className="flex flex-1 w-full overflow-auto p-4 items-start justify-center">
				<div
					data-testid="preview-frame-container"
					data-device={deviceWidth}
					style={{ width: DEVICE_WIDTH_CONFIG[deviceWidth].width }}
					className="mx-auto flex h-full min-h-[480px] shrink-0 flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-[width] duration-200 ease-in-out"
				>
					<iframe
						key={revision}
						srcDoc={debouncedHtml}
						sandbox="allow-scripts allow-forms allow-popups"
						title="Website Preview"
						className="w-full h-full border-0 bg-white"
					/>
				</div>
			</div>
		</div>
	);
}
