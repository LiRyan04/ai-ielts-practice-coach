import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "../../../chatgpt-auth";
import { getOrCreateAccount } from "../../../../lib/account";
import { getWritingPrompt } from "../../../../lib/writing/library";
import { WritingWorkspace } from "../writing-workspace";

export const metadata: Metadata = { title: "AI Writing Practice" };
export const dynamic = "force-dynamic";

export default async function GeneratedWritingPage({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  const identity = await requireChatGPTUser(`/practice/writing/${promptId}`);
  const account = await getOrCreateAccount(identity);
  const prompt = await getWritingPrompt(promptId, account.id);
  if (!prompt) notFound();
  return <WritingWorkspace key={prompt.id} prompt={prompt} />;
}
