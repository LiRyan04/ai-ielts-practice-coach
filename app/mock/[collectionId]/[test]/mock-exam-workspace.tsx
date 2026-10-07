"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { nextMockWrittenSkill } from "../../../../lib/practice/mock-exam";

type Skill = "listening" | "reading" | "writing" | "speaking";
type Progress = Record<Skill, { status: "not_started" | "in_progress" | "completed"; band?: number }>;
type Section = { skill: Skill; name: string; timing: string; detail: string; href: string | null };

export function MockExamWorkspace({ collectionId, test, sections, autoContinue = false, initialSessionId = "" }: { collectionId: string; test: number; sections: Section[]; autoContinue?: boolean; initialSessionId?: string }) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [report, setReport] = useState<{ overallBand: number | null; skills: Record<string, number | null> } | null>(null);
  const [error, setError] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const available = Object.fromEntries(sections.map((section) => [section.skill, Boolean(section.href)])) as Record<Skill, boolean>;

  useEffect(() => {
    const storageKey = `mock-exam:${collectionId}:${test}`;
    const savedSession = initialSessionId || window.localStorage.getItem(storageKey) || "";
    void fetch("/api/mock-exams", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ collectionId, testNumber: test, sessionId: savedSession, strictSession: Boolean(initialSessionId) }) })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "无法创建考试记录"); if (initialSessionId && payload.session.id !== initialSessionId) throw new Error("未找到这场考试记录"); setSessionId(payload.session.id); setProgress(payload.session.progress); setReport(payload.session.report || null); if (!initialSessionId) window.localStorage.setItem(storageKey, payload.session.id); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "无法创建考试记录"));
  }, [collectionId, test, initialSessionId]);

  async function startSection(section: Section) {
    if (!sessionId || !section.href || !progress || transitioning) return;
    setTransitioning(true);
    setError("");
    try {
      if (progress[section.skill].status === "not_started") {
        const response = await fetch("/api/mock-exams", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: sessionId, skill: section.skill, status: "in_progress" }) });
        if (!response.ok) throw new Error("考试进度保存失败");
        setProgress((current) => current ? { ...current, [section.skill]: { ...current[section.skill], status: "in_progress" } } : current);
      }
      router.replace(`${section.href}${section.href.includes("?") ? "&" : "?"}examSession=${encodeURIComponent(sessionId)}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法进入下一科");
      setTransitioning(false);
    }
  }

  async function restartExam() {
    setTransitioning(true);
    setError("");
    try {
      const response = await fetch("/api/mock-exams", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ collectionId, testNumber: test, forceNew: true }) });
      const payload = await response.json() as { session?: { id: string; progress: Progress }; error?: string };
      if (!response.ok || !payload.session) throw new Error(payload.error || "无法开始新一轮模考");
      window.localStorage.setItem(`mock-exam:${collectionId}:${test}`, payload.session.id);
      setSessionId(payload.session.id);
      setProgress(payload.session.progress);
      setReport(null);
      router.replace(`/mock/${collectionId}/${test}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法开始新一轮模考");
    } finally {
      setTransitioning(false);
    }
  }

  useEffect(() => {
    if (!autoContinue || !sessionId || !progress || transitioning) return;
    const nextSkill = nextMockWrittenSkill(progress, available);
    const next = sections.find((section) => section.skill === nextSkill);
    if (next) {
      const timer = window.setTimeout(() => void startSection(next), 0);
      return () => window.clearTimeout(timer);
    }
    else router.replace(`/mock/${collectionId}/${test}`);
    // Run once after the session has loaded; startSection manages the transition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoContinue, sessionId, progress]);

  return <>
    {error ? <p className="mock-exam-error" role="alert">{error}</p> : null}
    {transitioning ? <p className="mock-exam-transition" role="status">正在进入下一科，请稍候…</p> : null}
    <div className="mock-exam-section-list">
      {sections.map((section, index) => {
        const state = progress?.[section.skill]?.status || "not_started";
        const label = state === "completed" ? "Completed" : state === "in_progress" ? "In progress" : "Not completed";
        const isWritten = section.skill !== "speaking";
        const nextWritten = progress ? nextMockWrittenSkill(progress, available) : null;
        const locked = isWritten && nextWritten !== section.skill && state !== "completed";
        return <article className="mock-exam-section" key={section.name}>
          <span className="mock-exam-step">{index + 1}</span>
          <div><h2>{section.name}</h2><p>Timing: {section.timing}</p></div>
          <div className="mock-exam-detail"><b>{section.detail}</b><span className={state}>{label}</span></div>
          {section.href && !locked && state !== "completed" ? <button className="mock-exam-start" disabled={!sessionId || transitioning} onClick={() => void startSection(section)} type="button">{state === "in_progress" ? "继续考试" : section.skill === "speaking" ? "单独练习" : "开始考试"} <span aria-hidden="true">→</span></button> : <span className="mock-exam-unavailable">{state === "completed" ? "已交卷" : locked ? "完成上一科后开放" : "暂不可用"}</span>}
        </article>;
      })}
    </div>
    {report ? <section className="mock-combined-report"><div><small>COMBINED TEST REPORT</small><h2>整套考试报告</h2></div><strong>{report.overallBand == null ? "—" : report.overallBand.toFixed(1)}<span>Overall Band</span></strong><div className="mock-report-skills">{Object.entries(report.skills).map(([skill, band]) => <span key={skill}><b>{skill}</b>{band == null ? "—" : band.toFixed(1)}</span>)}</div></section> : null}
    {report ? <div className="mock-report-note"><p>笔试已完成。听力、阅读显示模考估分；写作和口语尚无完整评分，因此不计算 IELTS Overall Band。</p><button className="button button-secondary" disabled={transitioning} onClick={() => void restartExam()} type="button">重新开始一套模考</button></div> : null}
  </>;
}
