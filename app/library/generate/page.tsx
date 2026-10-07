import type { Metadata } from "next";
import { AppShell } from "../../components/app-shell";
import { requireChatGPTUser } from "../../chatgpt-auth";
import { getAccountSettings, getOrCreateAccount } from "../../../lib/account";
import { QuestionGenerator } from "./question-generator";

export const metadata: Metadata = { title: "AI 自动出题" };
export const dynamic = "force-dynamic";

export default async function GenerateQuestionsPage() {
  const identity = await requireChatGPTUser("/library/generate");
  const account = await getOrCreateAccount(identity);
  const settings = await getAccountSettings(account.id);
  return (
    <AppShell active="library">
      <QuestionGenerator configured={settings.apiKeyConfigured} provider={settings.provider} model={settings.model} />
    </AppShell>
  );
}
