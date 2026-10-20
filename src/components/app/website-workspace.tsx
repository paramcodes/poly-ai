"use client";

import { useChat } from "@ai-sdk/react";
import { type ChatTransport, DefaultChatTransport, type UIMessage } from "ai";
import { Code2, Loader2, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractMessageText } from "@/components/app/message-content";
import { WebsiteCodeView } from "@/components/app/website-code-view";
import {
	type DeviceWidth,
	WebsitePreview,
} from "@/components/app/website-preview";
import { WebsiteWorkspaceHeader } from "@/components/app/website-workspace-header";
import { WebsiteWorkspaceMessages } from "@/components/app/website-workspace-messages";
import type { AssignedModel } from "@/components/settings/models-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { extractHtml } from "@/lib/website/extract-html";

export interface WebsiteWorkspaceProps {
	selectedModel: AssignedModel;
	transport?: ChatTransport<UIMessage>;
	initialMessages?: UIMessage[];
	defaultTab?: "preview" | "code";
	defaultDeviceWidth?: DeviceWidth;
}

export function WebsiteWorkspace({
	selectedModel,
	transport: customTransport,
	initialMessages,
	defaultTab = "preview",
	defaultDeviceWidth = "desktop",
}: WebsiteWorkspaceProps) {
	const [input, setInput] = useState("");
	const [activeTab, setActiveTab] = useState<string>(defaultTab);
	const [deviceWidth, setDeviceWidth] =
		useState<DeviceWidth>(defaultDeviceWidth);
	const [reloadKey, setReloadKey] = useState(0);
	const [copied, setCopied] = useState(false);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const selectedModelRef = useRef(selectedModel);

	useEffect(() => {
		selectedModelRef.current = selectedModel;
	}, [selectedModel]);

	const defaultTransport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/generate/website",
				prepareSendMessagesRequest: ({ messages, body }) => ({
					body: {
						messages,
						providerId: selectedModelRef.current.providerId,
						modelId: selectedModelRef.current.modelId,
						...body,
					},
				}),
			}),
		[],
	);

	const { messages, sendMessage, stop, status, error, setMessages } = useChat({
		transport: customTransport ?? defaultTransport,
		messages: initialMessages,
	});

	const isLoading = status === "submitted" || status === "streaming";

	const lastAssistantMessage = useMemo(() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			if (messages[i].role === "assistant") {
				return messages[i];
			}
		}
		return null;
	}, [messages]);

	const rawAssistantText = useMemo(() => {
		if (!lastAssistantMessage) return "";
		return extractMessageText(lastAssistantMessage);
	}, [lastAssistantMessage]);

	const extractedHtml = useMemo(() => {
		if (!rawAssistantText) return "";
		return extractHtml(rawAssistantText);
	}, [rawAssistantText]);

	const handleSubmit = useCallback(
		async (e?: React.FormEvent) => {
			e?.preventDefault();
			const trimmed = input.trim();
			if (!trimmed || isLoading) return;

			setInput("");
			if (textareaRef.current) {
				textareaRef.current.style.height = "auto";
			}

			try {
				await sendMessage({ text: trimmed });
			} catch {
				// useChat tracks errors in its status and error properties
			}
		},
		[input, isLoading, sendMessage],
	);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			void handleSubmit();
		}
	};

	const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setInput(e.target.value);
		const el = e.target;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
	};
	const handleCopy = async () => {
		if (!extractedHtml) return;
		try {
			await navigator.clipboard.writeText(extractedHtml);
			setCopied(true);
			setTimeout(() => {
				setCopied(false);
			}, 2000);
		} catch {
			// ignore clipboard write errors
		}
	};

	const handleDownload = () => {
		if (!extractedHtml) return;
		try {
			const blob = new Blob([extractedHtml], {
				type: "text/html;charset=utf-8",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "index.html";
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch {
			// ignore download errors
		}
	};

	const handleRetry = useCallback(async () => {
		const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
		if (!lastUserMsg) return;
		const userText = extractMessageText(lastUserMsg);
		if (!userText) return;

		setMessages(messages.slice(0, -1));
		try {
			await sendMessage({ text: userText });
		} catch {
			// handled by useChat
		}
	}, [messages, sendMessage, setMessages]);

	return (
		<div className="flex h-full w-full flex-col gap-4">
			<ResizablePanelGroup
				direction="horizontal"
				className="min-h-[640px] h-[calc(100vh-14rem)] w-full rounded-xl border bg-background overflow-hidden"
			>
				{/* Left Panel: Prompt input, model info, generate button, and generation history/status */}
				<ResizablePanel
					defaultSize="40%"
					minSize="300px"
					className="flex flex-col border-r min-w-[300px]"
				>
					{/* Header / Model info */}
					<div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
						<div className="flex items-center gap-2">
							<Code2 className="size-4 text-muted-foreground" />
							<span className="text-sm font-semibold text-foreground">
								{selectedModel.name}
							</span>
							<Badge variant="outline" className="text-[11px] font-normal">
								{selectedModel.providerName}
							</Badge>
						</div>
						{isLoading && (
							<div className="flex items-center gap-1.5 text-xs text-primary">
								<Loader2 className="size-3 animate-spin motion-reduce:animate-none" />
								<span>
									{status === "streaming" ? "Streaming..." : "Generating..."}
								</span>
							</div>
						)}
					</div>

					{/* Generation history / status messages */}
					<div className="flex-1 overflow-auto p-4">
						<WebsiteWorkspaceMessages
							messages={messages}
							selectedModel={selectedModel}
							error={error}
							onRetry={handleRetry}
						/>
					</div>

					{/* Prompt input and generate button */}
					<form
						onSubmit={handleSubmit}
						className="border-t bg-background p-3 space-y-2"
					>
						<Textarea
							ref={textareaRef}
							value={input}
							onChange={handleTextareaInput}
							onKeyDown={handleKeyDown}
							placeholder="Enter a prompt for website generation..."
							disabled={isLoading}
							rows={3}
							className="min-h-[72px] max-h-[160px] resize-none text-sm"
							aria-label="Website prompt"
						/>
						<div className="flex items-center justify-between">
							<span className="text-[11px] text-muted-foreground">
								Enter to generate, Shift+Enter for newline
							</span>
							{isLoading ? (
								<Button
									type="button"
									variant="destructive"
									size="sm"
									onClick={stop}
									className="h-8 px-3 text-xs"
								>
									<Square className="mr-1.5 size-3.5 fill-current" />
									Stop
								</Button>
							) : (
								<Button
									type="submit"
									disabled={!input.trim()}
									size="sm"
									className="h-8 px-3 text-xs"
								>
									<Sparkles className="mr-1.5 size-3.5" />
									Generate
								</Button>
							)}
						</div>
					</form>
				</ResizablePanel>

				<ResizableHandle withHandle />

				{/* Right Panel: Tabs (Preview and Code), header controls, live preview, and code view */}
				<ResizablePanel defaultSize="60%" className="flex flex-col">
					<Tabs
						value={activeTab}
						onValueChange={setActiveTab}
						className="flex h-full w-full flex-col gap-0"
					>
						{/* Right panel header */}
						<WebsiteWorkspaceHeader
							activeTab={activeTab}
							deviceWidth={deviceWidth}
							onDeviceWidthChange={setDeviceWidth}
							onReload={() => setReloadKey((prev) => prev + 1)}
							onCopy={handleCopy}
							onDownload={handleDownload}
							hasHtml={Boolean(extractedHtml)}
							copied={copied}
						/>

						{/* Preview Tab */}
						<TabsContent
							value="preview"
							className="flex-1 mt-0 overflow-hidden"
						>
							<WebsitePreview
								html={extractedHtml}
								isStreaming={isLoading}
								deviceWidth={deviceWidth}
								onDeviceWidthChange={setDeviceWidth}
								reloadKey={reloadKey}
								showControls={false}
							/>
						</TabsContent>

						{/* Code Tab */}
						<TabsContent value="code" className="flex-1 mt-0 overflow-hidden">
							<WebsiteCodeView
								html={extractedHtml}
								filename="index.html"
								showActions={false}
							/>
						</TabsContent>
					</Tabs>
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	);
}
