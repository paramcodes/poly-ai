"use client";

import type { UIMessage } from "ai";
import { Check, Copy } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

function isTextPart(part: unknown): part is { type: "text"; text: string } {
	if (!part || typeof part !== "object") return false;
	if (!("type" in part) || !("text" in part)) return false;
	return part.type === "text" && typeof part.text === "string";
}

function isReasoningPart(
	part: unknown,
): part is { type: "reasoning"; text: string } {
	if (!part || typeof part !== "object") return false;
	if (!("type" in part) || !("text" in part)) return false;
	return part.type === "reasoning" && typeof part.text === "string";
}

export function extractMessageText(
	message: UIMessage | { parts?: unknown[]; content?: unknown },
): string {
	if (
		typeof message === "object" &&
		message !== null &&
		"content" in message &&
		typeof message.content === "string"
	) {
		return message.content;
	}
	if (
		typeof message === "object" &&
		message !== null &&
		"parts" in message &&
		Array.isArray(message.parts)
	) {
		const texts: string[] = [];
		for (const part of message.parts) {
			if (isTextPart(part)) {
				texts.push(part.text);
			}
		}
		return texts.join("");
	}
	return "";
}

export function extractMessageReasoning(
	message: UIMessage | { parts?: unknown[] },
): string {
	if (
		typeof message === "object" &&
		message !== null &&
		"parts" in message &&
		Array.isArray(message.parts)
	) {
		const reasoning: string[] = [];
		for (const part of message.parts) {
			if (isReasoningPart(part)) {
				reasoning.push(part.text);
			}
		}
		return reasoning.join("");
	}
	return "";
}

export function renderInline(text: string): React.ReactNode[] {
	const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
	return parts.map((part, i) => {
		if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
			return (
				<code
					key={`code-${i}-${part.slice(1, 5)}`}
					className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
				>
					{part.slice(1, -1)}
				</code>
			);
		}
		if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
			return (
				<strong
					key={`bold-${i}-${part.slice(2, 6)}`}
					className="font-semibold text-foreground"
				>
					{part.slice(2, -2)}
				</strong>
			);
		}
		return part;
	});
}

export function FormattedMessageText({
	text,
	isStreaming,
}: {
	text: string;
	isStreaming?: boolean;
}) {
	if (!text) {
		return isStreaming ? (
			<span
				className="inline-block w-1.5 h-4 align-middle bg-primary animate-pulse motion-reduce:animate-none"
				data-slot="streaming-cursor"
				aria-hidden="true"
			/>
		) : null;
	}

	const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
	const elements: React.ReactNode[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null = codeBlockRegex.exec(text);

	while (match !== null) {
		const textBefore = text.slice(lastIndex, match.index);
		if (textBefore) {
			elements.push(
				<span key={`text-${lastIndex}`}>{renderInline(textBefore)}</span>,
			);
		}
		const language = match[1] || "";
		const code = match[2];
		elements.push(
			<div
				key={`code-block-${match.index}`}
				className="my-2.5 overflow-hidden rounded-lg border bg-muted/70 text-xs font-mono"
			>
				{language && (
					<div className="flex items-center justify-between border-b bg-muted/90 px-3 py-1 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
						<span>{language}</span>
					</div>
				)}
				<pre className="overflow-x-auto p-3 leading-relaxed">
					<code>{code}</code>
				</pre>
			</div>,
		);
		lastIndex = match.index + match[0].length;
		match = codeBlockRegex.exec(text);
	}

	const remaining = text.slice(lastIndex);
	if (remaining) {
		elements.push(
			<span key={`text-${lastIndex}`}>{renderInline(remaining)}</span>,
		);
	}

	return (
		<div className="space-y-2 whitespace-pre-wrap break-words leading-relaxed">
			{elements}
			{isStreaming && (
				<span
					className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-primary animate-pulse motion-reduce:animate-none"
					data-slot="streaming-cursor"
					aria-hidden="true"
				/>
			)}
		</div>
	);
}

export function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// ignore clipboard write failure in restricted iframe/browser context
		}
	};

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			onClick={handleCopy}
			aria-label={copied ? "Copied" : "Copy to clipboard"}
			className="text-muted-foreground hover:text-foreground"
		>
			{copied ? (
				<Check className="size-3 text-green-500" />
			) : (
				<Copy className="size-3" />
			)}
		</Button>
	);
}
