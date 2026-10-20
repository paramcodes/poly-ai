"use client";

import type { UIMessage } from "ai";
import { AlertCircle, Bot, Code2, FileCode, RotateCcw } from "lucide-react";
import {
	extractMessageReasoning,
	extractMessageText,
} from "@/components/app/message-content";
import type { AssignedModel } from "@/components/settings/models-table";
import { Button } from "@/components/ui/button";

export interface WebsiteWorkspaceMessagesProps {
	messages: UIMessage[];
	selectedModel: AssignedModel;
	error: Error | undefined;
	onRetry: () => void;
}

export function WebsiteWorkspaceMessages({
	messages,
	selectedModel,
	error,
	onRetry,
}: WebsiteWorkspaceMessagesProps) {
	if (messages.length === 0) {
		return (
			<div className="flex h-full min-h-[280px] flex-col items-center justify-center text-center p-6 text-muted-foreground">
				<div className="flex size-12 items-center justify-center rounded-full bg-muted mb-3">
					<Code2 className="size-6 text-muted-foreground" />
				</div>
				<h3 className="text-base font-semibold text-foreground">
					Ready to generate
				</h3>
				<p className="mt-1 text-sm text-muted-foreground max-w-xs">
					Describe the website you want to create and watch it render in the
					live preview.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{messages.map((message) => {
				const isUser = message.role === "user";
				const text = extractMessageText(message);
				const reasoning = extractMessageReasoning(message);

				return (
					<div
						key={message.id}
						className={`flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}
					>
						<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
							{isUser ? (
								<span>You</span>
							) : (
								<>
									<Bot className="size-3" />
									<span>{selectedModel.name}</span>
								</>
							)}
						</div>

						<div
							className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm ${
								isUser
									? "bg-primary text-primary-foreground"
									: "border bg-muted/30 text-foreground"
							}`}
						>
							{reasoning && (
								<div className="mb-2 rounded border border-border/50 bg-background/50 p-2 text-xs text-muted-foreground">
									<div className="font-semibold mb-1">Reasoning</div>
									<div>{reasoning}</div>
								</div>
							)}
							{isUser ? (
								<div className="whitespace-pre-wrap">{text}</div>
							) : (
								<div className="space-y-1">
									<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
										<FileCode className="size-3.5" />
										<span>Website HTML generated</span>
									</div>
									<div className="text-xs text-muted-foreground/80 line-clamp-3 font-mono">
										{text.slice(0, 150)}...
									</div>
								</div>
							)}
						</div>
					</div>
				);
			})}

			{error && (
				<div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-destructive text-xs">
					<AlertCircle className="size-4 shrink-0 mt-0.5" />
					<div className="flex-1 space-y-1">
						<p className="font-semibold">Generation failed</p>
						<p>{error.message || "An unexpected error occurred"}</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onRetry}
							className="mt-2 h-7 px-2 text-xs"
						>
							<RotateCcw className="mr-1 size-3" />
							Retry
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
