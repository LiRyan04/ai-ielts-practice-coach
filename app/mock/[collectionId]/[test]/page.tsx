import Link from "next/link";
import { notFound } from "next/navigation";
import { requireChatGPTUser } from "../../../chatgpt-auth";
import { getOrCreateAccount } from "../../../../lib/account";
import { listListeningPapers } from "../../../../lib/listening/library";
import { listReadingPapers } from "../../../../lib/reading/library";
import { listWritingPrompts } from "../../../../lib/writing/library";
import { listSpeakingParts } from "../../../../lib/speaking/library";
import { MockExamWorkspace } from "./mock-exam-workspace";

export const dynamic = "force-dynamic";

function testNumber(id: string, fallback: number) {
  return Number(id.match(/-(\d+)-(?:task|part|p|s)/)?.[1] || id.match(/-(\d+)$/)?.[1] || fallback);
}

export default async function MockExamPage({ params, searchParams }: { params: Promise<{ collectionId: string; test: string }>; searchParams: Promise<{ continue?: string; sessionId?: string }> }) {
  const { collectionId, test: rawTest } = await params;
  const test = Number(rawTest);
  const query = await searchParams;
  const autoContinue = query.continue === "1";
  if (!Number.isInteger(test) || test < 1) notFound();
  const identity = await requireChatGPTUser(`/mock/${collectionId}/${test}`);
  const account = await getOrCreateAccount(identity);
  const [allListening, allReading, allWriting] = await Promise.all([
    listListeningPapers(account.id), listReadingPapers(account.id), listWritingPrompts(account.id),
  ]);
  const listening = allListening.find((paper, index) => paper.collectionId === collectionId && testNumber(paper.id, index + 1) === test);
  const reading = allReading.find((paper, index) => paper.collectionId === collectionId && testNumber(paper.id, index + 1) === test);
  const writingTasks = allWriting.filter((prompt, index) => prompt.collectionId === collectionId && testNumber(prompt.id, index + 1) === test);
  const writing = writingTasks.some((prompt) => prompt.taskType === "task1") && writingTasks.some((prompt) => prompt.taskType === "task2");
  const speaking = listSpeakingParts(collectionId).find((part) => part.test === test && part.part === 1);
  if (!listening && !reading && !writing && !speaking) notFound();

  const sections = [
    { skill: "listening" as const, name: "Listening", timing: "30 minutes", detail: "4 Parts · 40 Questions", href: listening ? `/practice/listening/${listening.id}?mode=exam&test=${test}` : null },
    { skill: "reading" as const, name: "Reading", timing: "60 minutes", detail: "3 Passages · 40 Questions", href: reading ? `/practice/reading/${reading.id}?mode=exam&test=${test}` : null },
    { skill: "writing" as const, name: "Writing", timing: "60 minutes", detail: "2 Tasks · shared timer", href: writing ? `/mock/${collectionId}/${test}/writing` : null },
    { skill: "speaking" as const, name: "Speaking", timing: "11–14 minutes", detail: "3 Parts", href: speaking ? `/practice/speaking/${test}/1?mode=exam` : null },
  ];

  return (
    <main className="mock-exam-shell">
      <header className="mock-exam-header">
        <Link href="/library" className="mock-exam-brand"><span>IELTS</span><b>C{collectionId}T{test}</b></Link>
        <Link href="/library" className="mock-exam-exit">退出考试</Link>
      </header>
      <section className="mock-exam-page">
        <p className="mock-exam-date">IELTS ACADEMIC · COMPUTER DELIVERED</p>
        <h1>IELTS on Computer</h1>
        <div className="mock-exam-title-row"><div><strong>Cambridge {collectionId} · Test {test}</strong><span>连续模拟考试</span></div><small>Listening → Reading → Writing</small></div>
        <MockExamWorkspace autoContinue={autoContinue} initialSessionId={query.sessionId} collectionId={collectionId} sections={sections} test={test} />
        <aside className="mock-exam-notice"><b>考试说明</b><p>听力 4 Part、阅读 3 篇、写作 2 Task。每科在最后一部分交卷，系统会继续下一科；口语需要考官，本站只提供单独的题目练习，不生成口语成绩。</p></aside>
      </section>
    </main>
  );
}
