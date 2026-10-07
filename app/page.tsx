import type { Metadata } from "next";
import { AppShell } from "./components/app-shell";
import { PracticeHome } from "./components/practice-home";
import { requireChatGPTUser } from "./chatgpt-auth";
import { getAccountSettings, getOrCreateAccount } from "../lib/account";
import { listReadingPapers } from "../lib/reading/library";

export const metadata: Metadata = { title: "练习中心" };
export const dynamic = "force-dynamic";

export default async function PracticeCenterPage() {
  const identity = await requireChatGPTUser("/");
  const account = await getOrCreateAccount(identity);
  const settings = await getAccountSettings(account.id);
  const papers = await listReadingPapers(account.id);
  const collections = new Set(papers.map((paper) => paper.collectionId));

  return (
    <AppShell active="practice">
      <PracticeHome
        displayName={account.displayName}
        currentBand={settings.currentBand}
        targetBand={settings.targetBand}
        papers={papers.slice(0, 6)}
        stats={{
          papers: papers.length,
          collections: collections.size,
          questions: papers.reduce((sum, paper) => sum + paper.questionCount, 0),
        }}
      />
    </AppShell>
  );
}
