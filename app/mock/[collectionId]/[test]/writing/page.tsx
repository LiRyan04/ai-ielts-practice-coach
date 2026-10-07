import { notFound } from "next/navigation";
import { requireChatGPTUser } from "../../../../chatgpt-auth";
import { getOrCreateAccount } from "../../../../../lib/account";
import { getWritingPrompt, listWritingPrompts } from "../../../../../lib/writing/library";
import { MockWritingWorkspace } from "./writing-workspace";

export const dynamic = "force-dynamic";

function testNumber(id: string, fallback: number) {
  return Number(id.match(/-(\d+)-(?:task|part|p|s)/)?.[1] || id.match(/-(\d+)$/)?.[1] || fallback);
}

export default async function MockWritingPage({ params }: { params: Promise<{ collectionId: string; test: string }> }) {
  const { collectionId, test: rawTest } = await params;
  const test = Number(rawTest);
  if (!Number.isInteger(test) || test < 1) notFound();
  const identity = await requireChatGPTUser(`/mock/${collectionId}/${test}/writing`);
  const account = await getOrCreateAccount(identity);
  const allPrompts = await listWritingPrompts(account.id);
  const summaries = allPrompts.filter((prompt, index) => prompt.collectionId === collectionId && testNumber(prompt.id, index + 1) === test);
  const task1Summary = summaries.find((prompt) => prompt.taskType === "task1");
  const task2Summary = summaries.find((prompt) => prompt.taskType === "task2");
  if (!task1Summary || !task2Summary) notFound();
  const [task1, task2] = await Promise.all([getWritingPrompt(task1Summary.id, account.id), getWritingPrompt(task2Summary.id, account.id)]);
  if (!task1 || !task2) notFound();
  return <MockWritingWorkspace collectionId={collectionId} prompts={[task1, task2]} test={test} />;
}
