import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "../components/app-shell";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getOrCreateAccount } from "../../lib/account";
import { listListeningPapers } from "../../lib/listening/library";
import { listReadingPapers } from "../../lib/reading/library";
import { listWritingPrompts } from "../../lib/writing/library";

export const metadata: Metadata = { title: "题库" };
export const dynamic = "force-dynamic";

type Collection = {
  id: string;
  title: string;
  readingPapers: number;
  listeningPapers: number;
  writingPrompts: number;
  readingQuestions: number;
  listeningQuestions: number;
  attempts: number;
};

export default async function LibraryPage() {
  const identity = await requireChatGPTUser("/library");
  const account = await getOrCreateAccount(identity);
  const [readingPapers, listeningPapers, writingPrompts] = await Promise.all([
    listReadingPapers(account.id),
    listListeningPapers(account.id),
    listWritingPrompts(account.id),
  ]);
  const collectionMap = new Map<string, Collection>();
  collectionMap.set("ai", {
    id: "ai",
    title: "AI 私人题库",
    readingPapers: 0,
    listeningPapers: 0,
    writingPrompts: 0,
    readingQuestions: 0,
    listeningQuestions: 0,
    attempts: 0,
  });
  for (const paper of [...readingPapers, ...listeningPapers, ...writingPrompts]) {
    if (!collectionMap.has(paper.collectionId)) {
      collectionMap.set(paper.collectionId, {
        id: paper.collectionId,
        title: paper.collectionTitle,
        readingPapers: 0,
        listeningPapers: 0,
        writingPrompts: 0,
        readingQuestions: 0,
        listeningQuestions: 0,
        attempts: 0,
      });
    }
  }
  for (const paper of readingPapers) {
    const collection = collectionMap.get(paper.collectionId)!;
    collection.readingPapers += 1;
    collection.readingQuestions += paper.questionCount;
    collection.attempts += paper.attemptCount;
  }
  for (const paper of listeningPapers) {
    const collection = collectionMap.get(paper.collectionId)!;
    collection.listeningPapers += 1;
    collection.listeningQuestions += paper.questionCount;
    collection.attempts += paper.attemptCount;
  }
  for (const prompt of writingPrompts) {
    const collection = collectionMap.get(prompt.collectionId)!;
    collection.writingPrompts += 1;
  }
  const collections = [...collectionMap.values()].sort((a, b) => a.id === "21" ? -1 : b.id === "21" ? 1 : a.id === "ai" ? -1 : 1);

  return (
    <AppShell active="library">
      <header className="page-heading library-heading">
        <div>
          <p className="eyebrow">PRIVATE IELTS LIBRARY</p>
          <h1>先选题库，再选题型。</h1>
        </div>
      </header>
      <section className="collection-grid" aria-label="IELTS 题库">
        {collections.map((collection) => (
          <article className="card collection-card" key={collection.id}>
            <div className="collection-card-heading">
              <div className="collection-identity">
                <span className="collection-volume">{collection.id === "ai" ? "AI" : `C${collection.id}`}</span>
                <div><h2>{collection.title}</h2></div>
              </div>
              <span>{collection.attempts ? `已练 ${collection.attempts} 次` : "未开始"}</span>
            </div>
            {collection.id === "ai" ? (
              <div className="collection-ai-entry"><span>按科目管理私人练习内容</span><Link href="/library/ai">进入题库 →</Link></div>
            ) : (
              <div className="collection-exam-panel">
                <strong>模拟考试</strong>
                <div className="collection-exam-tests" aria-label={`${collection.title} 模拟考试`}>
                  {[1, 2, 3, 4].map((test) => <Link href={`/mock/${collection.id}/${test}`} key={test}><b>Test {test}</b></Link>)}
                </div>
              </div>
            )}
            <Link className="collection-link" href={`/library/${collection.id}`}>查看全部题目 <span aria-hidden="true">→</span></Link>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
