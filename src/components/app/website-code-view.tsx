"use client";

import { Check, Copy, Download, FileCode } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

export interface WebsiteCodeViewProps {
	html: string;
	filename?: string;
	showActions?: boolean;
	onCopy?: () => void;
	onDownload?: () => void;
	className?: string;
}

export function WebsiteCodeView({
	html,
	filename = "index.html",
	showActions = true,
	onCopy,
	onDownload,
	className,
}: WebsiteCodeViewProps) {
	const [copied, setCopied] = useState(false);

	const lines = useMemo(() => {
		if (!html) return [];
		return html.split("\n");
	}, [html]);

	const handleCopy = useCallback(async () => {
		if (!html) return;
		try {
			await navigator.clipboard.writeText(html);
			setCopied(true);
			setTimeout(() => {
				setCopied(false);
			}, 2000);
			onCopy?.();
		} catch {
			// ignore clipboard write failure in restricted environments
		}
	}, [html, onCopy]);

	const handleDownload = useCallback(() => {
		if (!html) return;
		try {
			const blob = new Blob([html], { type: "text/html;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			onDownload?.();
		} catch {
			// ignore download failures in non-browser/restricted environments
		}
	}, [html, filename, onDownload]);

	return (
		<div
			className={`flex h-full w-full flex-col overflow-hidden bg-muted/10 font-mono text-xs ${className ?? ""}`}
			data-testid="website-code-view"
		>
			{showActions && (
				<div className="flex items-center justify-between border-b bg-background/80 px-3 py-2 backdrop-blur-xs">
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<FileCode className="size-3.5 text-muted-foreground" />
						<span className="font-medium text-foreground">{filename}</span>
						{lines.length > 0 && (
							<span className="text-[11px] text-muted-foreground">
								({lines.length} {lines.length === 1 ? "line" : "lines"})
							</span>
						)}
					</div>

					<div className="flex items-center gap-1.5">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleCopy}
							disabled={!html}
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
							onClick={handleDownload}
							disabled={!html}
							aria-label="Download .html file"
							className="h-7 px-2 text-xs"
						>
							<Download className="mr-1 size-3" />
							Download
						</Button>
					</div>
				</div>
			)}

			<div className="flex-1 overflow-auto p-4">
				{lines.length === 0 ? (
					<div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-muted-foreground">
						<FileCode className="mb-2 size-8 text-muted-foreground/50" />
						<p className="text-sm font-medium">No HTML code generated yet</p>
						<p className="mt-1 text-xs text-muted-foreground/80">
							Enter a prompt to generate website HTML code.
						</p>
					</div>
				) : (
					<pre className="flex font-mono text-xs leading-relaxed text-foreground">
						<div
							className="select-none pr-4 text-right text-muted-foreground/40 border-r border-border/40 shrink-0"
							aria-hidden="true"
						>
							{lines.map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: line index is stable per render
								<div key={i}>{i + 1}</div>
							))}
						</div>
						<code className="pl-4 overflow-x-auto whitespace-pre font-mono">
							{lines.map((line, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: line index is stable per render
								<div key={i}>{line || "\n"}</div>
							))}
						</code>
					</pre>
				)}
			</div>
		</div>
	);
}
