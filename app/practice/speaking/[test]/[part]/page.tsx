import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "../../../../components/app-shell";
import { getSpeakingPart } from "../../../../../lib/speaking/library";
import { SpeakingCompleteButton } from "./speaking-complete-button";

export const metadata: Metadata = { title: "IELTS Speaking" };

export default async function SpeakingPartPage({ params, searchParams }: { params: Promise<{ test: string; part: string }>; searchParams: Promise<{ examSession?: string }> }) {
  const { test: testValue, part: partValue } = await params;
  const test = Number(testValue);
  const part = Number(partValue);
  const { examSession = "" } = await searchParams;
  const examQuery = examSession ? `?examSession=${encodeURIComponent(examSession)}` : "";
  const speakingPart = getSpeakingPart(test, part);
  if (!speakingPart) notFound();
  return (
    <AppShell active="practice">
      <header className="page-heading">
        <div><Link className="back-link" href="/library/21?skill=speaking">← 返回 Speaking 题库</Link><p className="eyebrow">IELTS ACADEMIC 21 · TEST {test}</p><h1>Speaking Part {part}</h1><p>{speakingPart.title}</p></div>
      </header>
      <main className="speaking-practice-card card">
        <div className="speaking-part-heading"><span>PART {part}</span><h2>{speakingPart.title}</h2><p>{part === 1 ? "Answer the examiner’s questions about familiar topics." : part === 2 ? "You have one minute to prepare, then speak for one to two minutes." : "Discuss the following questions with the examiner."}</p></div>
        <ol>{speakingPart.questions.map((question, index) => <li key={`${question}-${index}`}>{question}</li>)}</ol>
        <label className="field"><span>Preparation notes</span><textarea placeholder="Write brief notes here…" rows={8} /></label>
        <nav className="speaking-part-navigation">
          {part > 1 ? <Link className="button button-secondary" href={`/practice/speaking/${test}/${part - 1}${examQuery}`}>← Part {part - 1}</Link> : <span />}
          {part < 3 ? <Link className="button button-primary" href={`/practice/speaking/${test}/${part + 1}${examQuery}`}>Part {part + 1} →</Link> : examSession ? <SpeakingCompleteButton examSession={examSession} test={test} /> : <Link className="button button-primary" href="/library/21?skill=speaking">完成</Link>}
        </nav>
      </main>
    </AppShell>
  );
}
