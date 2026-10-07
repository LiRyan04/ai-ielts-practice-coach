"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReadingPaperSummary } from "../../lib/reading/library";
import { LearningStatsCard } from "../dashboard/learning-stats-card";

type Mode = "practice" | "exam";

const skillCards = [
  {
    key: "listening",
    number: "01",
    title: "Listening",
    description: "按 Part 练习，记录答案与用时。",
    href: "/library",
    meta: "从题库选择",
    state: "ready",
  },
  {
    key: "reading",
    number: "02",
    title: "Reading",
    description: "三篇文章并排答题，提交后查看逐题结果。",
    href: "/library",
    meta: "从题库选择",
    state: "ready",
  },
  {
    key: "writing",
    number: "03",
    title: "Writing",
    description: "Task 1 与 Task 2 写作、保存和反馈。",
    href: "/library",
    meta: "从题库选择",
    state: "ready",
  },
  {
    key: "speaking",
    number: "04",
    title: "Speaking",
    description: "Part 1–3 题库、录音与回答复盘。",
    href: "/library",
    meta: "正在转换",
    state: "planned",
  },
] as const;

export function PracticeHome({
  displayName,
  currentBand,
  targetBand,
  papers,
  stats,
}: {
  displayName: string;
  currentBand: number;
  targetBand: number;
  papers: ReadingPaperSummary[];
  stats: { papers: number; collections: number; questions: number };
}) {
  const [mode, setMode] = useState<Mode>("practice");
  const primaryHref = "/library";
  const targetProgress = Math.max(0, Math.min(100, Math.round(currentBand / targetBand * 100)));

  return (
    <>
      <header className="practice-hero">
        <div className="practice-hero-copy">
          <p className="eyebrow">IELTS TRAINING WORKSPACE</p>
          <h1>{displayName}，今天练哪一科？</h1>
        </div>
        <div className="mode-switch" aria-label="训练模式">
          <button className={mode === "practice" ? "active" : ""} onClick={() => setMode("practice")} type="button">
            <span>练习模式</span><small>分科 · 可复盘</small>
          </button>
          <button className={mode === "exam" ? "active" : ""} onClick={() => setMode("exam")} type="button">
            <span>考试模式</span><small>计时 · 连续作答</small>
          </button>
        </div>
      </header>

      <section className="merged-overview-grid" aria-label="学习概览">
        <article className="card merged-score-card">
          <div className="section-title-row"><div><p className="eyebrow">LEARNING OVERVIEW</p><h2>学习概览</h2></div><Link className="text-button" href="/my-practice">查看我的练习 →</Link></div>
          <div className="merged-score-line"><strong>{currentBand.toFixed(1)}</strong><span>目标 Band {targetBand.toFixed(1)}</span></div>
          <div className="progress-track" aria-label={`目标分数进度 ${targetProgress}%`}><i style={{ width: `${targetProgress}%` }} /></div>
          <p>{currentBand >= targetBand ? "已经达到当前目标，继续用稳定练习巩固。" : `距离目标还差 ${(targetBand - currentBand).toFixed(1)} 个 Band。今天完成一项训练，保持节奏。`}</p>
          <div className="overview-shortcuts"><Link href="/my-practice">练习记录</Link><Link href="/library/generate">AI 生成题目</Link><Link href="/review">错题复盘</Link></div>
        </article>
        <LearningStatsCard />
      </section>

      <section className="practice-summary card">
        <div><strong>{stats.collections}</strong><span>题库</span></div>
        <div><strong>{stats.questions}</strong><span>阅读题目</span></div>
        <div><strong>4</strong><span>听说读写</span></div>
        <div className="practice-summary-action">
          <span>{mode === "practice" ? "选择题库或生成原创练习" : "选择一套完整题目开始模考"}</span>
          <Link href={primaryHref}>{mode === "practice" ? "浏览题库" : "开始模考"} →</Link>
        </div>
      </section>

      <section className="home-section">
        <div className="section-title-row">
          <div><p className="eyebrow">CHOOSE A SKILL</p><h2>四科训练</h2></div>
          <span className="section-note">{mode === "practice" ? "当前：自由练习" : "当前：计时考试"}</span>
        </div>
        <div className="skill-grid">
          {skillCards.map((skill) => (
            <Link className={`card skill-card ${skill.state}`} href={skill.href} key={skill.key}>
              <span className="skill-number">{skill.number}</span>
              <div><h3>{skill.title}</h3><p>{skill.description}</p></div>
              <footer><span>{skill.meta}</span><b aria-hidden="true">→</b></footer>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="section-title-row">
          <div><p className="eyebrow">READING LIBRARY</p><h2>{mode === "practice" ? "继续练习" : "选择一套模考"}</h2></div>
          <Link className="text-button" href="/library">查看全部题库</Link>
        </div>
        <div className="home-paper-list">
          {papers.map((paper, index) => (
            <Link className="home-paper-row" href={`/practice/reading/${paper.id}`} key={paper.id}>
              <span className="paper-index">{String(index + 1).padStart(2, "0")}</span>
              <span className="home-paper-title"><small>{paper.collectionTitle}</small><strong>{paper.title}</strong></span>
              <span>{paper.passageCount} 篇 · {paper.questionCount} 题</span>
              <span>{paper.latestBand == null ? "未练习" : `Band ${paper.latestBand.toFixed(1)}`}</span>
              <b aria-hidden="true">→</b>
            </Link>
          ))}
          {!papers.length ? <div className="card empty-practice-state"><strong>题库还没有内容</strong><p>可以生成原创题目，或导入有权使用的练习材料。</p><Link href="/library/generate">AI 生成新题 →</Link></div> : null}
        </div>
      </section>

      <section className="home-section tool-section">
        <div className="section-title-row">
          <div><p className="eyebrow">STUDY TOOLS</p><h2>学习工具</h2></div>
        </div>
        <div className="tool-links">
          <Link href="/review"><span>↺</span><strong>错题本</strong><small>复盘阅读与写作失分</small></Link>
          <Link href="/vocabulary"><span>Aa</span><strong>生词本</strong><small>集中记忆训练词汇</small></Link>
          <Link href="/writing-resources"><span>¶</span><strong>写作资料</strong><small>模板、范文和表达积累</small></Link>
          <Link href="/grammar"><span>✓</span><strong>语法工具</strong><small>按错误类型专项练习</small></Link>
        </div>
      </section>
    </>
  );
}
