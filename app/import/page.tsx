import type { Metadata } from "next";
import { AppShell } from "../components/app-shell";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getAccountSettings, getOrCreateAccount } from "../../lib/account";
import { MaterialImporter } from "./material-importer";

export const metadata: Metadata = { title: "导入材料" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const identity = await requireChatGPTUser("/import");
  const account = await getOrCreateAccount(identity);
  const settings = await getAccountSettings(account.id);
  return <AppShell active="import"><MaterialImporter configured={settings.apiKeyConfigured} /></AppShell>;
}
