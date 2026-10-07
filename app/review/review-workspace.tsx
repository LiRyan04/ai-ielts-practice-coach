"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ObjectiveReviewAttempt, PracticeDiagnosis, ReviewSkill, WritingReview } from "../../lib/review/history";

type Filter = "all" | ReviewSkill | "writing";
const filters: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "全部" }, { key: "listening", label: "听力" }, { key: "reading", label: "阅读" }, { key: "writing", label: "写作" },
];
const skillNames = { listening: "听力", reading: "阅读" } as const;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

export function ReviewWorkspace({ attempts: initialAttempts, writing }: { attempts: ObjectiveReviewAttempt[]; writing: WritingReview[] }) {
  const [attempts, setAttempts] = useState(initialAttempts);
  const [filter, setFilter] = useState<Filter>("all");
  const [activeQuestions, setActiveQuestions] = useState<Record<string, number>>({});
  const [diagnosing, setDiagnosing] = useState("");
  const [error, setError] = useState("");
  const visibleAttempts = useMemo(() => attempts.filter((attempt) => filter === "all" || attempt.skill === filter), [attempts, filter]);
  const visibleWriting = filter === "all" || filter === "writing" ? writing : [];
  const wrongCount = attempts.reduce((sum, attempt) => sum + attempt.wrongAnswers.length, 0);
  const diagnosedCount = attempts.filter((attempt) => attempt.diagnosis).length;

  async function diagnose(attempt: ObjectiveReviewAttempt) {
    setDiagnosing(attempt.id);
    setError("");
    try {
      const response = await fetch("/api/review/diagnose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ attemptId: attempt.id, skill: attempt.skill }) });
      const payload = await response.json() as { diagnosis?: PracticeDiagnosis; error?: string };
      if (!response.ok || !payload.diagnosis) throw new Error(payload.error || "错题诊断失败");
      setAttempts((current) => current.map((item) => item.id === attempt.id ? { ...item, diagnosis: payload.diagnosis } : item));
    } catch (diagnosisError) {
      setError(diagnosisError instanceof Error ? diagnosisError.message : "错题诊断失败");
    } finally { setDiagnosing(""); }
  }

  return (
    <>
      <header className="page-heading review-heading">
        <div><p className="eyebrow">EVIDENCE-BASED REVIEW</p><h1>错题复盘</h1></div>
        <Link className="button button-secondary" href="/ai-tutor">咨询 AI 助教 →</Link>
      </header>

      <section className="review-overview card">
        <div><strong>{wrongCount}</strong><span>客观错题</span></div><div><strong>{attempts.length}</strong><span>待复盘记录</span></div><div><strong>{diagnosedCount}</strong><span>已 AI 诊断</span></div><div><strong>{writing.length}</strong><span>写作评审</span></div>
        <div className="record-filter" role="group" aria-label="复盘科目筛选">{filters.map((item) => <button aria-pressed={filter === item.key} className={filter === item.key ? "active" : ""} key={item.key} onClick={() => setFilter(item.key)} type="button">{item.label}</button>)}</div>
      </section>
      {error ? <p className="review-error" role="alert">{error} <Link href="/settings">检查 AI 设置 →</Link></p> : null}

      {visibleAttempts.length ? <section className="home-section review-section">
        <div className="section-title-row"><div><p className="eyebrow">OBJECTIVE MISTAKES</p><h2>听力与阅读错题</h2></div><span className="section-note">AI 不能修改客观判分</span></div>
        <div className="review-attempt-list">{visibleAttempts.map((attempt) => {
          const activeNumber = activeQuestions[attempt.id] ?? attempt.wrongAnswers[0]?.questionNumber;
          const wrong = attempt.wrongAnswers.find((item) => item.questionNumber === activeNumber) ?? attempt.wrongAnswers[0];
          const diagnosisItem = attempt.diagnosis?.items.find((item) => item.questionNumber === activeNumber);
          const tutorPrompt = diagnosisItem ? `请继续辅导我这道${skillNames[attempt.skill]}错题：第 ${diagnosisItem.questionNumber} 题，错因是“${diagnosisItem.errorType}”。诊断：${diagnosisItem.analysis}。请给我一道相似的微型练习。` : `请帮我复盘这道${skillNames[attempt.skill]}错题：第 ${wrong.questionNumber} 题，我答“${wrong.answer}”，正确答案是“${wrong.correctAnswer}”。`;
          return <details className="card review-attempt-card" key={`${attempt.skill}-${attempt.id}`}>
            <summary><span className={`skill-badge ${attempt.skill}`}>{skillNames[attempt.skill]}</span><span className="review-attempt-main"><strong>{attempt.title}</strong><small>{attempt.collectionTitle} · {formatDate(attempt.submittedAt)}</small></span><span>{attempt.correctCount}/{attempt.scoredCount}</span><strong>Band {attempt.bandScore.toFixed(1)}</strong><span className="record-chevron">⌄</span></summary>
            <div className="review-attempt-body">
              <div className="review-toolbar"><div className="review-question-tabs" role="tablist" aria-label="选择错题">{attempt.wrongAnswers.map((item) => <button aria-selected={item.questionNumber === activeNumber} className={item.questionNumber === activeNumber ? "active" : ""} key={item.questionNumber} onClick={() => setActiveQuestions((current) => ({ ...current, [attempt.id]: item.questionNumber }))} role="tab" type="button">{item.questionNumber}</button>)}</div><button className="button button-secondary" disabled={diagnosing === attempt.id} onClick={() => void diagnose(attempt)} type="button">{diagnosing === attempt.id ? "正在读取原文诊断…" : attempt.diagnosis ? "重新生成诊断" : "AI 深度诊断"}</button></div>
              <div className="review-answer-facts"><div><span>你的答案</span><strong>{wrong.answer || "未作答"}</strong></div><div><span>标准答案</span><strong>{wrong.correctAnswer}</strong></div><span className="objective-lock">客观判分已锁定</span></div>
              {diagnosisItem ? <div className="diagnosis-board">
                <div className="diagnosis-heading"><span>{diagnosisItem.errorType}</span><small>{attempt.diagnosis?.provider} · {attempt.diagnosis?.model}</small></div>
                <div className="diagnosis-grid"><article><span>错因解析</span><p>{diagnosisItem.analysis}</p></article><article><span>原文 / 录音证据</span><p>{diagnosisItem.evidence}</p></article><article><span>下一步训练</span><p>{diagnosisItem.nextAction}</p></article></div>
                {diagnosisItem.paraphrases.length ? <div className="paraphrase-list"><span>同义替换</span>{diagnosisItem.paraphrases.map((pair, index) => <b key={`${pair.source}-${index}`}>{pair.source}<i>→</i>{pair.replacement}</b>)}</div> : null}
                <div className="diagnosis-actions"><Link href={attempt.href}>重做这套题 →</Link><Link href={`/ai-tutor?prompt=${encodeURIComponent(tutorPrompt)}`}>带着诊断问助教 →</Link></div>
              </div> : <div className="diagnosis-empty"><p>生成诊断后，会显示这道题的错误类型、材料证据、同义替换和针对性训练动作。</p></div>}
              {attempt.diagnosis?.summary ? <p className="diagnosis-summary"><strong>本次模式：</strong>{attempt.diagnosis.summary}{attempt.diagnosis.patterns.length ? ` · ${attempt.diagnosis.patterns.join(" / ")}` : ""}</p> : null}
            </div>
          </details>;
        })}</div>
      </section> : null}

      {visibleWriting.length ? <section className="home-section review-section">
        <div className="section-title-row"><div><p className="eyebrow">WRITING REVIEW</p><h2>写作语言问题</h2></div><span className="section-note">来自最近一次四项评审</span></div>
        <div className="writing-review-grid">{visibleWriting.map((record) => <article className="card writing-review-card" key={record.id}><div><span className="skill-badge writing">写作</span><strong>Band {record.bandScore.toFixed(1)}</strong></div><h3>{record.title}</h3><small>{formatDate(record.submittedAt)}</small>{record.issues.length ? <ul>{record.issues.slice(0, 4).map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}{record.annotations[0] ? <blockquote><del>{record.annotations[0].quote}</del><p>{record.annotations[0].explanation}</p><ins>{record.annotations[0].suggestion}</ins></blockquote> : null}<div><Link href={record.href}>重新练习 →</Link><Link href={`/ai-tutor?prompt=${encodeURIComponent(`请针对我这篇写作的薄弱项给一个 15 分钟训练：${record.issues.join("；")}`)}`}>问助教 →</Link></div></article>)}</div>
      </section> : null}

      {!visibleAttempts.length && !visibleWriting.length ? <div className="card empty-practice-state review-empty"><strong>当前没有需要复盘的记录</strong><p>完成听力、阅读或写作练习后，错题和评审会自动汇总到这里。</p><Link href="/">去完成一次练习 →</Link></div> : null}
    </>
  );
}
