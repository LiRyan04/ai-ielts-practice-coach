import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "../../../chatgpt-auth";
import { getOrCreateAccount } from "../../../../lib/account";
import { getReadingPaper } from "../../../../lib/reading/library";
import { ReadingWorkspace } from "./reading-workspace";

export const metadata: Metadata = { title: "Academic Reading" };
export const dynamic = "force-dynamic";

export default async function ReadingPracticePage({ params, searchParams }: { params: Promise<{ paperId: string }>; searchParams: Promise<{ passage?: string; examSession?: string; test?: string }> }) {
  const { paperId } = await params;
  const { passage, examSession, test } = await searchParams;
  const identity = await requireChatGPTUser(`/practice/reading/${paperId}`);
  const account = await getOrCreateAccount(identity);
  const paper = await getReadingPaper(paperId, account.id);
  if (!paper) notFound();
  return <ReadingWorkspace examSession={examSession || ""} mockTest={Number(test) || 0} initialPassage={Number(passage) || 1} paper={paper} />;
}
