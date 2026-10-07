import { AppShell } from "../components/app-shell";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getAccountSettings, getOrCreateAccount } from "../../lib/account";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const identity = await requireChatGPTUser("/settings");
  const account = await getOrCreateAccount(identity);
  const settings = await getAccountSettings(account.id);
  return (
    <AppShell active="settings">
      <header className="page-heading compact-heading">
        <div><p className="eyebrow">ACCOUNT & PREFERENCES</p><h1>设置</h1></div>
      </header>
      <SettingsForm account={account} initialSettings={settings} />
    </AppShell>
  );
}
