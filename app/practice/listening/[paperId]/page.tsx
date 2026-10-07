import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "../../../chatgpt-auth";
import { getAccountSettings, getOrCreateAccount } from "../../../../lib/account";
import { getListeningPaper } from "../../../../lib/listening/library";
import { ListeningWorkspace } from "./listening-workspace";

export const metadata: Metadata = { title: "IELTS Listening" };
export const dynamic = "force-dynamic";

export default async function ListeningPracticePage({ params, searchParams }: { params: Promise<{ paperId: string }>; searchParams: Promise<{ mode?: string; part?: string; examSession?: string; test?: string }> }) {
  const { paperId } = await params;
  const { mode, part, examSession, test } = await searchParams;
  const identity = await requireChatGPTUser(`/practice/listening/${paperId}`);
  const account = await getOrCreateAccount(identity);
  const settings = await getAccountSettings(account.id);
  const paper = await getListeningPaper(paperId, account.id);
  if (!paper) notFound();
  return <ListeningWorkspace examSession={examSession || ""} mockTest={Number(test) || 0} initialPart={Number(part) || 1} initialTtsModel={settings.ttsModel} initialTtsVoice={settings.ttsVoice} mode={mode === "exam" ? "exam" : "practice"} paper={paper} ttsProvider={settings.ttsProvider} />;
}
