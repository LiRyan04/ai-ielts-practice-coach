"use client";

import Link from "next/link";
import { useState } from "react";
import type { ListeningPaperSummary } from "../../../lib/listening/library";
import type { ReadingPaperSummary } from "../../../lib/reading/library";
import type { WritingPromptSummary } from "../../../lib/writing/library";
import type { SpeakingPart } from "../../../lib/speaking/library";

type Skill = "listening" | "reading" | "writing" | "speaking";

const skillLabels: Array<{ key: Skill; label: string }> = [
  { key: "listening", label: "Listening" },
  { key: "reading", label: "Reading" },
  { key: "writing", label: "Writing" },
  { key: "speaking", label: "Speaking" },
];

export function CollectionWorkspace({
  collectionId,
  initialSkill,
  title,
  listening,
  reading,
  speaking,
  writing,
}: {
  collectionId: string;
  initialSkill?: string;
  title: string;
  listening: ListeningPaperSummary[];
  reading: ReadingPaperSummary[];
  speaking: SpeakingPart[];
  writing: WritingPromptSummary[];
}) {
  const requestedSkill: Skill | null = initialSkill === "listening" || initialSkill === "reading" || initialSkill === "writing" || initialSkill === "speaking" ? initialSkill : null;
  const fallbackSkill: Skill = listening.length ? "listening" : reading.length ? "reading" : "writing";
  const [skill, setSkill] = useState<Skill>(requestedSkill || fallbackSkill);
  const [viewMode, setViewMode] = useState<"skill" | "test">("skill");
  const available = { listening: listening.length > 0, reading: reading.length > 0, writing: writing.length > 0, speaking: speaking.length > 0 };
  const testNumber = (id: string, fallback: number) => Number(id.match(/-(\d+)-(?:task|part|p|s)/)?.[1] || id.match(/-(\d+)$/)?.[1] || fallback);
  const testNumbers = Array.from(new Set(
    skill === "listening" ? listening.map((paper, index) => testNumber(paper.id, index + 1))
      : skill === "reading" ? reading.map((paper, index) => testNumber(paper.id, index + 1))
        : skill === "writing" ? writing.map((prompt, index) => testNumber(prompt.id, index + 1))
          : speaking.map((part) => part.test),
  )).sort((a, b) => a - b);
  const availableCount = {
    listening: new Set(listening.map((paper, index) => testNumber(paper.id, index + 1))).size,
    reading: new Set(reading.map((paper, index) => testNumber(paper.id, index + 1))).size,
    writing: new Set(writing.map((prompt, index) => testNumber(prompt.id, index + 1))).size,
    speaking: new Set(speaking.map((part) => part.test)).size,
  };
  const testMeta = {
    listening: { detail: "4 Parts · 40 Questions", duration: "约 30 分钟", action: "开始练习" },
    reading: { detail: "3 Passages · 40 Questions", duration: "60 分钟", action: "开始练习" },
    writing: { detail: "2 Tasks", duration: "60 分钟", action: "开始练习" },
    speaking: { detail: "3 Parts", duration: "11–14 分钟", action: "开始练习" },
  }[skill];
  const wholeTestHref = (number: number) => skill === "listening"
    ? `/practice/listening/${listening.find((paper, index) => testNumber(paper.id, index + 1) === number)?.id}`
    : skill === "reading"
      ? `/practice/reading/${reading.find((paper, index) => testNumber(paper.id, index + 1) === number)?.id}`
      : skill === "writing"
        ? `/practice/writing/${(writing.find((prompt, index) => testNumber(prompt.id, index + 1) === number && prompt.taskType === "task1") || writing.find((prompt, index) => testNumber(prompt.id, index + 1) === number))?.id}?test=${number}`
        : `/practice/speaking/${number}/1`;

  return (
    <>
      <header className="page-heading collection-heading">
        <div>
          <Link className="back-link" href="/library">← 返回全部题库</Link>
          <p className="eyebrow">{collectionId === "ai" ? "AI GENERATED · PRIVATE" : `IELTS ACADEMIC ${collectionId}`}</p>
          <h1>{title}</h1>
        </div>
        {collectionId === "ai" ? <Link className="button button-primary" href="/library/generate">生成新题 →</Link> : null}
      </header>
      <nav className="collection-view-picker" aria-label="题库排列方式">
        <button className={viewMode === "skill" ? "active" : ""} onClick={() => setViewMode("skill")} type="button">按科目</button>
        <button className={viewMode === "test" ? "active" : ""} onClick={() => setViewMode("test")} type="button">按 Test</button>
      </nav>
      {viewMode === "skill" ? <>
        <nav className="skill-picker card" aria-label="选择题型">
        {skillLabels.map((item) => (
          <button className={skill === item.key ? "active" : ""} key={item.key} onClick={() => setSkill(item.key)} type="button">
            <span>{item.label}</span><small>{available[item.key] ? `${availableCount[item.key]} Tests` : "暂无题目"}</small>
          </button>
        ))}
        </nav>
      {testNumbers.length > 0 ? (
        <section className="collection-direct-test-list" aria-label={`${skill} tests`}>
          {testNumbers.map((number) => (
            <article className="collection-test-suite card" key={number}>
              <div className="collection-test-primary">
                <Link className="collection-test-primary-hit" href={wholeTestHref(number)} aria-label={`${skill} Test ${number}，${testMeta.action}`} />
                <div className="collection-test-summary">
                  <h2>Test {number}</h2>
                </div>
                <div className="collection-test-actions">
                  <Link className="collection-whole-test-button" href={wholeTestHref(number)}><span>{testMeta.action}</span><b aria-hidden="true">→</b></Link>
                </div>
              </div>
              <div className="collection-test-specials">
                <div className="collection-test-specials-label"><b>专项练习</b></div>
                <div className="collection-direct-parts">
                {skill === "listening" ? listening.filter((paper, index) => testNumber(paper.id, index + 1) === number).flatMap((paper) => Array.from({ length: paper.sectionCount }, (_, index) => <Link href={`/practice/listening/${paper.id}?part=${index + 1}`} key={`${paper.id}-${index + 1}`}><b>Part {index + 1}</b></Link>))
                  : skill === "reading" ? reading.filter((paper, index) => testNumber(paper.id, index + 1) === number).flatMap((paper) => Array.from({ length: paper.passageCount }, (_, index) => <Link href={`/practice/reading/${paper.id}?passage=${index + 1}`} key={`${paper.id}-${index + 1}`}><b>Passage {index + 1}</b></Link>))
                    : skill === "writing" ? writing.filter((prompt, index) => testNumber(prompt.id, index + 1) === number).map((prompt) => <Link href={`/practice/writing/${prompt.id}`} key={prompt.id}><b>{prompt.taskType === "task1" ? "Task 1" : "Task 2"}</b></Link>)
                      : speaking.filter((part) => part.test === number).map((part) => <Link href={`/practice/speaking/${part.test}/${part.part}`} key={part.id}><b>Part {part.part}</b></Link>)}
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="card unavailable-skill">
          <h2>{skillLabels.find((item) => item.key === skill)?.label} 暂无题目</h2>
          <p>{collectionId === "ai" ? "生成的新题会自动保存到这个私人题库。" : "该题型内容尚未转换为项目原生练习格式。"}</p>
          {collectionId === "ai" ? <Link className="button button-primary" href="/library/generate">生成新题 →</Link> : <button className="button button-secondary" onClick={() => setSkill(listening.length ? "listening" : reading.length ? "reading" : "writing")} type="button">返回可练题型</button>}
        </section>
      )}
      </> : (
        <section className="collection-by-test-list" aria-label="按 Test 查看">
          {[1, 2, 3, 4].map((number) => {
            const listeningPaper = listening.find((paper, index) => testNumber(paper.id, index + 1) === number);
            const readingPaper = reading.find((paper, index) => testNumber(paper.id, index + 1) === number);
            const writingPrompt = writing.find((prompt, index) => testNumber(prompt.id, index + 1) === number && prompt.taskType === "task1") || writing.find((prompt, index) => testNumber(prompt.id, index + 1) === number);
            const speakingPart = speaking.find((part) => part.test === number && part.part === 1);
            return (
              <article className="collection-test-suite card" key={number}>
                <Link className="collection-test-primary" href={`/mock/${collectionId}/${number}`}>
                  <div className="collection-test-summary"><h2>Test {number}</h2></div>
                  <div className="collection-test-actions"><span className="collection-whole-test-button"><span>模拟考试</span><b aria-hidden="true">→</b></span></div>
                </Link>
                <div className="collection-test-specials">
                  <div className="collection-test-specials-label"><b>科目练习</b></div>
                  <div className="collection-direct-parts">
                    {listeningPaper ? <Link href={`/practice/listening/${listeningPaper.id}`}><b>Listening</b></Link> : null}
                    {readingPaper ? <Link href={`/practice/reading/${readingPaper.id}`}><b>Reading</b></Link> : null}
                    {writingPrompt ? <Link href={`/practice/writing/${writingPrompt.id}?test=${number}`}><b>Writing</b></Link> : null}
                    {speakingPart ? <Link href={`/practice/speaking/${number}/1`}><b>Speaking</b></Link> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
