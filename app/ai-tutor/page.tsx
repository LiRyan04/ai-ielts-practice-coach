import type { Metadata } from "next";
import { AppShell } from "../components/app-shell";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getOrCreateAccount } from "../../lib/account";
import { getTutorLearnerContext, getTutorMessages } from "../../lib/ai/tutor";
import { AiTutorWorkspace } from "./ai-tutor-workspace";

export const metadata: Metadata = { title: "AI 助教" };
export const dynamic = "force-dynamic";

export default async function AiTutorPage({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const params = await searchParams;
  const initialPrompt = typeof params.prompt === "string" ? params.prompt.slice(0, 4_000) : "";
  const identity = await requireChatGPTUser(initialPrompt ? `/ai-tutor?prompt=${encodeURIComponent(initialPrompt)}` : "/ai-tutor");
  const account = await getOrCreateAccount(identity);
  const [messages, context] = await Promise.all([getTutorMessages(account.id), getTutorLearnerContext(account.id)]);
  const overview = {
    targetBand: context.profile.targetBand,
    totalMinutes: context.learning.totalMinutes,
    recentMinutes: context.learning.recentSevenDayMinutes,
    completedExercises: context.learning.completedExercises,
    listeningCount: context.historicalOverview.listening?.attemptCount ?? 0,
    readingCount: context.historicalOverview.reading?.attemptCount ?? 0,
    writingCount: context.historicalOverview.writing?.attemptCount ?? 0,
    hasSummary: Boolean(context.latestLearningSummary),
  };
  return <AppShell active="tutor"><AiTutorWorkspace initialMessages={messages} initialPrompt={initialPrompt} overview={overview} /></AppShell>;
}
