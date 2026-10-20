"use client";

import { useChat } from "@ai-sdk/react";
import { type ChatTransport, DefaultChatTransport, type UIMessage } from "ai";
import {
	AlertCircle,
	Bot,
	Loader2,
	RotateCcw,
	Sparkles,
	Square,
	Type,
	User,
} from "lucide-react";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	CopyButton,
	extractMessageReasoning,
	extractMessageText,
	FormattedMessageText,
} from "@/components/app/message-content";
import type { AssignedModel } from "@/components/settings/models-table";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
	Message,
	MessageAvatar,
	MessageContent,
	MessageHeader,
} from "@/components/ui/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Textarea } from "@/components/ui/textarea";

export { extractMessageText, extractMessageReasoning };

export interface TextWorkspaceProps {
	selectedModel: AssignedModel;
	transport?: ChatTransport<UIMessage>;
	initialMessages?: UIMessage[];
}

export function TextWorkspace({
	selectedModel,
	transport: customTransport,
	initialMessages,
}: TextWorkspaceProps) {
	const [input, setInput] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const selectedModelRef = useRef(selectedModel);

	useEffect(() => {
		selectedModelRef.current = selectedModel;
	}, [selectedModel]);

	const defaultTransport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/generate/text",
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
		el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
	};

	const lastMessage = messages[messages.length - 1];
	const isWaitingForFirstToken =
		isLoading &&
		(messages.length === 0 ||
			lastMessage?.role === "user" ||
			(lastMessage?.role === "assistant" &&
				extractMessageText(lastMessage).length === 0));

	return (
		<div className="flex flex-col gap-6" data-slot="text-workspace">
			<div className="flex flex-col gap-6">
				{messages.length === 0 ? (
					<div
						data-slot="ready-to-generate"
						className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center bg-muted/20"
					>
						<div className="flex size-12 items-center justify-center rounded-full bg-muted mb-3">
							<Type className="size-6 text-muted-foreground" />
						</div>
						<h3 className="text-base font-semibold">Ready to generate</h3>
						<p className="text-sm text-muted-foreground max-w-sm mt-1">
							Enter a prompt and select a model to create text content.
						</p>
					</div>
				) : (
					<MessageScrollerProvider>
						<MessageScroller className="flex-1 min-h-[320px] max-h-[calc(100vh-22rem)] rounded-xl border bg-muted/10">
							<MessageScrollerViewport className="p-4 sm:p-6">
								<MessageScrollerContent>
									{messages.map((message, index) => {
										const isUser = message.role === "user";
										const text = extractMessageText(message);
										const reasoning = extractMessageReasoning(message);
										const isStreamingThis =
											isLoading && !isUser && index === messages.length - 1;

										if (
											!isUser &&
											text.length === 0 &&
											reasoning.length === 0
										) {
											return null;
										}

										return (
											<MessageScrollerItem
												key={message.id || index}
												messageId={message.id}
											>
												<Message
													align={isUser ? "end" : "start"}
													data-role={message.role}
												>
													<MessageAvatar>
														{isUser ? (
															<User className="size-4" />
														) : (
															<Bot className="size-4 text-primary" />
														)}
													</MessageAvatar>
													<MessageContent>
														<MessageHeader className="flex items-center justify-between">
															<span className="font-semibold text-xs">
																{isUser
																	? "You"
																	: selectedModel.name || "Assistant"}
															</span>
															{!isUser && text && <CopyButton text={text} />}
														</MessageHeader>
														<Bubble
															variant={isUser ? "default" : "muted"}
															align={isUser ? "end" : "start"}
															className={
																isUser
																	? "bg-primary text-primary-foreground"
																	: "bg-muted/60 text-foreground"
															}
														>
															<BubbleContent className="px-3.5 py-2.5 text-sm">
																{reasoning && (
																	<details className="mb-2 text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">
																		<summary className="cursor-pointer select-none py-0.5 font-medium hover:text-foreground">
																			Thinking process
																		</summary>
																		<div className="mt-1 whitespace-pre-wrap italic">
																			{reasoning}
																		</div>
																	</details>
																)}
																<FormattedMessageText
																	text={text}
																	isStreaming={isStreamingThis}
																/>
															</BubbleContent>
														</Bubble>
													</MessageContent>
												</Message>
											</MessageScrollerItem>
										);
									})}

									{isWaitingForFirstToken && (
										<MessageScrollerItem messageId="waiting-for-token">
											<Message align="start" data-role="assistant">
												<MessageAvatar>
													<Bot className="size-4 text-primary" />
												</MessageAvatar>
												<MessageContent>
													<MessageHeader>
														<span className="font-semibold text-xs">
															{selectedModel.name || "Assistant"}
														</span>
													</MessageHeader>
													<Bubble
														variant="muted"
														align="start"
														className="bg-muted/60 text-foreground"
													>
														<BubbleContent className="flex items-center gap-2 px-3.5 py-2.5 text-xs text-muted-foreground">
															<Loader2 className="size-3.5 animate-spin motion-reduce:animate-none text-primary" />
															<span>Thinking...</span>
														</BubbleContent>
													</Bubble>
												</MessageContent>
											</Message>
										</MessageScrollerItem>
									)}
								</MessageScrollerContent>
							</MessageScrollerViewport>
							<MessageScrollerButton direction="end" />
						</MessageScroller>
					</MessageScrollerProvider>
				)}

				{error && (
					<div
						role="alert"
						className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg"
					>
						<AlertCircle className="size-4 shrink-0" />
						<span className="flex-1">
							{error.message || "Failed to generate text"}
						</span>
					</div>
				)}

				<form onSubmit={handleSubmit} className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<label htmlFor="prompt-input" className="text-sm font-medium">
							Prompt
						</label>
						{messages.length > 0 && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setMessages([])}
								disabled={isLoading}
								className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
								aria-label="Clear chat"
							>
								<RotateCcw className="size-3 mr-1" />
								Clear chat
							</Button>
						)}
					</div>
					<div className="relative flex flex-col rounded-xl border bg-background p-2.5 shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20 transition-all motion-reduce:transition-none">
						<Textarea
							ref={textareaRef}
							id="prompt-input"
							value={input}
							onChange={handleTextareaInput}
							onKeyDown={handleKeyDown}
							placeholder="Enter a prompt for text generation..."
							disabled={isLoading}
							rows={2}
							className="min-h-20 max-h-48 resize-none border-0 p-1.5 shadow-none focus-visible:ring-0 focus-visible:border-0"
						/>
						<div className="flex items-center justify-between pt-2 border-t border-border/50">
							<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<span className="hidden sm:inline">Press</span>
								<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
									Enter
								</kbd>
								<span className="hidden sm:inline">to submit,</span>
								<kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
									Shift + Enter
								</kbd>
								<span className="hidden sm:inline">for newline</span>
							</div>
							<div className="flex items-center gap-2">
								{isLoading ? (
									<Button
										type="button"
										variant="destructive"
										size="sm"
										onClick={() => void stop()}
										aria-label="Stop generation"
										className="h-8"
									>
										<Square className="size-3.5 mr-1.5 fill-current" />
										Stop
									</Button>
								) : (
									<Button
										type="submit"
										size="sm"
										disabled={!input.trim()}
										aria-label="Generate"
										className="h-8"
									>
										<Sparkles className="size-3.5 mr-1.5" />
										Generate
									</Button>
								)}
							</div>
						</div>
					</div>
				</form>
			</div>
		</div>
	);
}
