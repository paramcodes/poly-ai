import type { Metadata } from "next";
import { ProvidersSettingsView } from "@/components/settings/providers-view";

export const metadata: Metadata = {
	title: "Providers & Models — Settings | Poly-AI",
};

export default function ProvidersSettingsPage() {
	return <ProvidersSettingsView />;
}
