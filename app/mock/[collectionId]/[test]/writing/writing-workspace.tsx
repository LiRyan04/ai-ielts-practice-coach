"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { localDateString } from "../../../../../lib/learning/date";
import { countWords } from "../../../../../lib/writing/rules";
import type { WritingPrompt } from "../../../../../lib/writing/library";
import { ExamSplitPane } from "../../../../components/exam-split-pane";
import { FullscreenButton } from "../../../../components/fullscreen-button";
import { TaskVisual } from "../../../../practice/writing/writing-workspace";

const DURATION_SECONDS = 60 * 60;

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function MockWritingWorkspace({ collectionId, test, prompts }: { collectionId: string; test: number; prompts: [WritingPrompt, WritingPrompt] }) {
  const router = useRouter();
  const [examSession, setExamSession] = useState("");
  const [activeTask, setActiveTask] = useState(0);
  const [essays, setEssays] = useState<[string, string]>(["", ""]);
  const [secondsLeft, setSecondsLeft] = useState(DURATION_SECONDS);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const attemptIds = useRef<[string | null, string | null]>([null, null]);
  const inFlight = useRef<[Promise<string | null> | null, Promise<string | null> | null]>([null, null]);
  const snapshot = useRef({ essays, secondsLeft });
  const submitted = useRef(false);
  const prompt = prompts[activeTask];
  const words = countWords(essays[activeTask]);
  const returnHref = `/mock/${collectionId}/${test}`;

  useEffect(() => {
    const timer = window.setTimeout(() => setExamSession(new URLSearchParams(window.location.search).get("examSession") || ""), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    snapshot.current = { essays, secondsLeft };
  }, [essays, secondsLeft]);

  useEffect(() => {
    if (!examSession) return;
    let cancelled = false;
    const loadDraft = async (item: WritingPrompt) => {
      const response = await fetch(`/api/writing/attempts?promptId=${encodeURIComponent(item.id)}&examSessionId=${encodeURIComponent(examSession)}`, { cache: "no-store" });
      const payload = await response.json() as { draft?: { id: string; content: string; durationSeconds: number }; error?: string };
      if (!response.ok) throw new Error(payload.error || "写作草稿读取失败");
      return payload.draft || null;
    };
    const loadSession = async () => {
      const response = await fetch("/api/mock-exams", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ collectionId, testNumber: test, sessionId: examSession }) });
      const payload = await response.json() as { session?: { id: string; progress: { writing?: { updatedAt?: string } } }; error?: string };
      if (!response.ok || payload.session?.id !== examSession) throw new Error(payload.error || "模考记录已失效，请从模考首页重新进入");
      const startedAt = Date.parse(payload.session.progress.writing?.updatedAt || "");
      return Number.isFinite(startedAt) ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0;
    };
    void Promise.all([loadDraft(prompts[0]), loadDraft(prompts[1]), loadSession()]).then(([first, second, elapsed]) => {
      if (cancelled) return;
      attemptIds.current = [first?.id || null, second?.id || null];
      setEssays([first?.content || "", second?.content || ""]);
      setSecondsLeft(Math.max(0, DURATION_SECONDS - Math.max(first?.durationSeconds || 0, second?.durationSeconds || 0, elapsed)));
      setReady(true);
    }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "写作草稿读取失败"); });
    return () => { cancelled = true; };
  }, [collectionId, examSession, prompts, test]);

  const saveTask = useCallback(async (index: number, status: "draft" | "submitted" = "draft") => {
    if (inFlight.current[index]) await inFlight.current[index];
    const content = snapshot.current.essays[index];
    if (!content.trim()) return null;
    const currentId = attemptIds.current[index];
    const operation = (async () => {
      const response = await fetch(currentId ? `/api/writing/attempts/${currentId}` : "/api/writing/attempts", {
        method: currentId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ promptId: prompts[index].id, examSessionId: examSession, taskType: prompts[index].taskType, content, durationSeconds: DURATION_SECONDS - snapshot.current.secondsLeft, status, localDate: localDateString() }),
      });
      const payload = await response.json() as { attempt?: { id: string }; error?: string };
      if (!response.ok || !payload.attempt) throw new Error(payload.error || "写作答案保存失败");
      attemptIds.current[index] = payload.attempt.id;
      return payload.attempt.id;
    })();
    inFlight.current[index] = operation;
    setSaving(true);
    try { return await operation; }
    finally { if (inFlight.current[index] === operation) inFlight.current[index] = null; setSaving(Boolean(inFlight.current[0] || inFlight.current[1])); }
  }, [examSession, prompts]);

  useEffect(() => {
    if (!ready || !examSession || submitted.current) return;
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [examSession, ready]);

  useEffect(() => {
    if (!ready || !examSession || submitted.current) return;
    const timer = window.setTimeout(() => {
      void Promise.all([saveTask(0), saveTask(1)]).catch((reason) => setError(reason instanceof Error ? reason.message : "写作答案保存失败"));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [essays, examSession, ready, saveTask]);

  useEffect(() => {
    if (!ready || !examSession || submitted.current) return;
    const timer = window.setInterval(() => {
      void Promise.all([saveTask(0), saveTask(1)]).catch((reason) => setError(reason instanceof Error ? reason.message : "写作答案保存失败"));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [examSession, ready, saveTask]);

  const finish = useCallback(async () => {
    if (!ready || !examSession || submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    setConfirming(false);
    setError("");
    try {
      const ids = await Promise.all([saveTask(0, "submitted"), saveTask(1, "submitted")]);
      const response = await fetch("/api/mock-exams", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: examSession, skill: "writing", status: "completed", attemptId: ids[1] || ids[0] || undefined }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "模考进度保存失败");
      }
      router.replace(`${returnHref}?continue=1`);
    } catch (reason) {
      submitted.current = false;
      setSubmitting(false);
      setError(reason instanceof Error ? reason.message : "写作交卷失败");
    }
  }, [examSession, ready, returnHref, router, saveTask]);

  useEffect(() => {
    if (ready && secondsLeft === 0 && !submitted.current) void finish();
  }, [finish, ready, secondsLeft]);

  return <div className="exam-shell mock-writing-shell">
    <header className="exam-topbar">
      <Link className="exam-brand" href={returnHref}><span>A</span> AI–IELTS</Link>
      <div className="exam-meta"><span>ACADEMIC WRITING · TEST {test}</span><b>Task 1 + Task 2</b></div>
      <div className="exam-top-actions"><FullscreenButton /><div className={secondsLeft < 300 ? "exam-timer urgent" : "exam-timer"}><small>TIME REMAINING</small><strong>{formatTime(secondsLeft)}</strong></div></div>
    </header>
    <div className="exam-toolbar"><div>{prompts.map((item, index) => <button className={activeTask === index ? "tab-button active" : "tab-button"} key={item.id} onClick={() => setActiveTask(index)} type="button">Task {index + 1} · {countWords(essays[index])} words</button>)}</div><div className="save-indicator">{saving ? "正在保存" : ready ? "答案自动保存" : "正在恢复草稿"}</div></div>
    {error || (ready && !examSession) ? <p className="mock-writing-error inline-error" role="alert">{error || "缺少模考记录，请从模考首页进入写作。"}</p> : null}
    <ExamSplitPane className="writing-grid" left={<section className="prompt-panel"><p className="eyebrow">WRITING TASK {activeTask + 1}</p><h1>{prompt.title}</h1><div className="prompt-copy"><p>{prompt.prompt}</p></div>{prompt.imageUrl ? <Image alt={`${prompt.title} task visual`} className="writing-task-image" height={800} src={prompt.imageUrl} unoptimized width={1200} /> : null}{prompt.visual ? <TaskVisual visual={prompt.visual} /> : null}<div className="task-guidance"><strong>Write at least {activeTask === 0 ? 150 : 250} words.</strong><p>{activeTask === 0 ? "建议约 20 分钟。" : "建议约 40 分钟；Task 2 的评分权重是 Task 1 的两倍。"}</p></div></section>} right={<section className="editor-panel"><textarea aria-label={`Writing Task ${activeTask + 1} 作文`} disabled={!ready || submitting} onChange={(event) => setEssays((current) => { const next: [string, string] = [...current]; next[activeTask] = event.target.value; return next; })} placeholder="Start writing your answer here…" spellCheck={false} value={essays[activeTask]} /><div className="editor-footer"><span>{words} words · Task {activeTask + 1}</span><span>两道题共用 60 分钟</span></div></section>} />
    <footer className="exam-footer"><div><span className="exam-hint">两题共用 60 分钟；交卷前可返回检查。</span></div><div className="exam-actions">{activeTask === 0 ? <button className="button button-secondary" disabled={!ready || submitting} onClick={() => setActiveTask(1)} type="button">Next Task 2 →</button> : <button className="button button-secondary" disabled={!ready || submitting} onClick={() => setActiveTask(0)} type="button">← Task 1</button>}<button className="button button-primary" disabled={!ready || !examSession || submitting} onClick={() => setConfirming(true)} type="button">{submitting ? "正在交卷…" : "Finish Writing"}</button></div></footer>
    {confirming ? <div className="exam-finish-backdrop" role="presentation"><section aria-labelledby="writing-finish-title" aria-modal="true" className="exam-finish-dialog" role="dialog"><p className="eyebrow">FINAL CHECK</p><h2 id="writing-finish-title">确认交卷？</h2><p>Task 1：{countWords(essays[0])} 词；Task 2：{countWords(essays[1])} 词。交卷后进入下一阶段，无法修改本次答案。</p><div><button className="button button-secondary" onClick={() => setConfirming(false)} type="button">返回检查</button><button className="button button-primary" onClick={() => void finish()} type="button">确认交卷</button></div></section></div> : null}
  </div>;
}
