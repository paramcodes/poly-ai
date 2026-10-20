"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";

function SignInForm() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const redirectUrl = searchParams.get("redirect") || "/app/text";

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!email || !password) return;

		setLoading(true);
		try {
			const res = await signIn.email({
				email,
				password,
			});

			if (res.error) {
				toast.error(res.error.message || "Invalid email or password");
				setLoading(false);
				return;
			}

			toast.success("Signed in successfully");
			router.push(redirectUrl);
			router.refresh();
		} catch {
			toast.error("An unexpected error occurred. Please try again.");
			setLoading(false);
		}
	}

	async function handleSocial(provider: "github" | "google") {
		try {
			await signIn.social({
				provider,
				callbackURL: redirectUrl,
			});
		} catch {
			toast.error(`Failed to initiate ${provider} sign-in`);
		}
	}

	return (
		<Card className="w-full max-w-md border-border/40 shadow-xl">
			<CardHeader className="space-y-1">
				<CardTitle className="text-2xl font-bold tracking-tight">
					Sign in to Poly-AI
				</CardTitle>
				<CardDescription>
					Enter your email and password to access your generation studio
				</CardDescription>
			</CardHeader>
			<form onSubmit={handleSubmit}>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="name@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							required
							disabled={loading}
						/>
					</div>
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="password">Password</Label>
						</div>
						<Input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							required
							disabled={loading}
						/>
					</div>
					<Button type="submit" className="w-full" disabled={loading}>
						{loading && (
							<Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" />
						)}
						Sign In
					</Button>

					<div className="relative my-2">
						<div className="absolute inset-0 flex items-center">
							<span className="w-full border-t border-border/40" />
						</div>
						<div className="relative flex justify-center text-xs uppercase">
							<span className="bg-card px-2 text-muted-foreground">
								Or continue with
							</span>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => handleSocial("github")}
							disabled={loading}
						>
							GitHub
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleSocial("google")}
							disabled={loading}
						>
							Google
						</Button>
					</div>
				</CardContent>
				<CardFooter className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
					<div>Don&apos;t have an account?</div>
					<Link
						href={`/sign-up${redirectUrl ? `?redirect=${encodeURIComponent(redirectUrl)}` : ""}`}
						className="font-medium text-foreground hover:underline"
					>
						Sign up
					</Link>
				</CardFooter>
			</form>
		</Card>
	);
}

export default function SignInPage() {
	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<Suspense
				fallback={
					<div className="flex items-center justify-center">
						<Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none text-muted-foreground" />
					</div>
				}
			>
				<SignInForm />
			</Suspense>
		</div>
	);
}
