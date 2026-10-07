import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "../../components/app-shell";
import { requireChatGPTUser } from "../../chatgpt-auth";
import { getOrCreateAccount } from "../../../lib/account";
import { listListeningPapers } from "../../../lib/listening/library";
import { listReadingPapers } from "../../../lib/reading/library";
import { listWritingPrompts } from "../../../lib/writing/library";
import { listSpeakingParts } from "../../../lib/speaking/library";
import { CollectionWorkspace } from "./collection-workspace";

export const metadata: Metadata = { title: "题库详情" };
export const dynamic = "force-dynamic";

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ collectionId: string }>;
  searchParams: Promise<{ skill?: string }>;
}) {
  const { collectionId } = await params;
  const { skill } = await searchParams;
  const identity = await requireChatGPTUser(`/library/${collectionId}`);
  const account = await getOrCreateAccount(identity);
  const [allReading, allListening, allWriting] = await Promise.all([
    listReadingPapers(account.id),
    listListeningPapers(account.id),
    listWritingPrompts(account.id),
  ]);
  const reading = allReading.filter((paper) => paper.collectionId === collectionId);
  const listening = allListening.filter((paper) => paper.collectionId === collectionId);
  const writing = allWriting.filter((prompt) => prompt.collectionId === collectionId);
  const speaking = listSpeakingParts(collectionId);
  if (collectionId !== "ai" && !reading.length && !listening.length && !writing.length && !speaking.length) notFound();
  const title = collectionId === "ai" ? "AI 私人题库" : (reading[0]?.collectionTitle || listening[0]?.collectionTitle || writing[0]?.collectionTitle || `IELTS ${collectionId}`);

  return (
    <AppShell active="library">
      <CollectionWorkspace collectionId={collectionId} initialSkill={skill} listening={listening} reading={reading} speaking={speaking} title={title} writing={writing} />
    </AppShell>
  );
}
