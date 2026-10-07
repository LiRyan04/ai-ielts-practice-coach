"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { localDateString } from "../../../../lib/learning/date";
import { formatExamText } from "../../../../lib/practice/format-exam-text";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ListeningPaper } from "../../../../lib/listening/library";
import { transcriptCues } from "../../../../lib/listening/transcript";
import type { TtsProvider } from "../../../../lib/account";
import { ListeningAudioPlayer, type ListeningTtsModel, type ListeningTtsVoice } from "../../../components/listening-audio-player";
import { AttemptResumeDialog, type AttemptChoice } from "../../../components/attempt-resume-dialog";
import { ExamQuestionNavigator } from "../../../components/exam-question-navigator";
import { FullscreenButton } from "../../../components/fullscreen-button";
import { IeltsQuestionLayout } from "../../../components/ielts-question-layout";
import { IeltsListeningPartTwo } from "../../../components/ielts-listening-part-two";
import { IeltsListeningPartThree } from "../../../components/ielts-listening-part-three";
import { SyncedTranscript } from "../../../components/synced-transcript";

const DURATION_SECONDS = 30 * 60;

type Result = {
  correctCount: number;
  scoredCount: number;
  bandScore: number;
  details: Array<{ questionNumber: number; answer: string; correctAnswer: string | null; scorable: boolean; correct: boolean | null }>;
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function ListeningWorkspace({ paper, ttsProvider, initialTtsModel, initialTtsVoice, initialPart, mode, examSession = "", mockTest = 0 }: { paper: ListeningPaper; ttsProvider: TtsProvider; initialTtsModel: ListeningTtsModel; initialTtsVoice: ListeningTtsVoice; initialPart: number; mode: "practice" | "exam"; examSession?: string; mockTest?: number }) {
  const router = useRouter();
  const mockHref = `/mock/${paper.collectionId}/${mockTest}`;
  const initialSectionIndex = Math.min(paper.sections.length - 1, Math.max(0, initialPart - 1));
  const [sectionIndex, setSectionIndex] = useState(initialSectionIndex);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(DURATION_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [transcriptProgress, setTranscriptProgress] = useState<number | null>(null);
  const [activeQuestion, setActiveQuestion] = useState(paper.sections[initialSectionIndex]?.questions[0]?.number ?? 1);
  const [reviewedQuestions, setReviewedQuestions] = useState<Set<number>>(() => new Set());
  const [draftState, setDraftState] = useState<"loading" | "saving" | "saved" | "error">("loading");
  const [entryState, setEntryState] = useState<"loading" | "choosing" | "started">("loading");
  const [attemptChoices, setAttemptChoices] = useState<AttemptChoice[]>([]);
  const [entryBusy, setEntryBusy] = useState(false);
  const attemptIdRef = useRef<string | null>(null);
  const forceNewRef = useRef(false);
  const entryCheckStartedRef = useRef(false);
  const restoredRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const draftSnapshotRef = useRef({ answers, sectionIndex, activeQuestion, reviewedQuestions: [] as number[], durationSeconds: 0 });
  const section = paper.sections[sectionIndex];
  const usesPartTwoLayout = section.id === "academic21-listening-1-s2";
  const usesPartThreeLayout = section.id === "academic21-listening-1-s3";
  const layoutQuestionNumbers = useMemo(() => new Set(section.layoutQuestionNumbers || []), [section.layoutQuestionNumbers]);
  const standardQuestions = useMemo(() => section.questions.filter((question) => !layoutQuestionNumbers.has(question.number) && !usesPartTwoLayout && !usesPartThreeLayout), [layoutQuestionNumbers, section.questions, usesPartThreeLayout, usesPartTwoLayout]);
  const transcriptRows = useMemo(() => transcriptCues(section.transcript), [section.transcript]);
  const activeTranscriptIndex = useMemo(() => {
    if (transcriptProgress == null || transcriptRows.length === 0) return -1;
    const totalWeight = transcriptRows.reduce((sum, cue) => sum + cue.spokenWeight, 0);
    const target = Math.min(1, Math.max(0, transcriptProgress)) * totalWeight;
    let consumed = 0;
    const index = transcriptRows.findIndex((cue) => { consumed += cue.spokenWeight; return consumed >= target; });
    return index < 0 ? transcriptRows.length - 1 : index;
  }, [transcriptProgress, transcriptRows]);
  const totalQuestions = useMemo(() => paper.sections.reduce((sum, item) => sum + item.questions.length, 0), [paper]);
  const answeredCount = Object.values(answers).filter((answer) => answer.trim()).length;
  const answeredQuestions = useMemo(() => new Set(Object.entries(answers).filter(([, answer]) => answer.trim()).map(([number]) => Number(number))), [answers]);
  const questionGroups = useMemo(() => paper.sections.map((item) => ({ label: `Part ${item.number}`, questions: item.questions.map((question) => question.number) })), [paper]);

  useEffect(() => {
    draftSnapshotRef.current = { answers, sectionIndex, activeQuestion, reviewedQuestions: Array.from(reviewedQuestions), durationSeconds: DURATION_SECONDS - secondsLeft };
  }, [activeQuestion, answers, reviewedQuestions, secondsLeft, sectionIndex]);

  const persistDraft = useCallback(async () => {
    if (!restoredRef.current || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setDraftState("saving");
    const snapshot = draftSnapshotRef.current;
    try {
      const response = await fetch("/api/listening/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paperId: paper.id, examSessionId: examSession, attemptId: attemptIdRef.current, forceNew: forceNewRef.current, status: "draft", answers: snapshot.answers, durationSeconds: snapshot.durationSeconds, progress: { sectionIndex: snapshot.sectionIndex, activeQuestion: snapshot.activeQuestion, reviewedQuestions: snapshot.reviewedQuestions } }),
        keepalive: true,
      });
      const payload = await response.json() as { attempt?: { id: string }; error?: string };
      if (!response.ok || !payload.attempt) throw new Error(payload.error || "草稿保存失败");
      attemptIdRef.current = payload.attempt.id;
      forceNewRef.current = false;
      setDraftState("saved");
    } catch {
      setDraftState("error");
    } finally {
      saveInFlightRef.current = false;
    }
  }, [examSession, paper.id]);

  useEffect(() => {
    if (entryCheckStartedRef.current) return;
    entryCheckStartedRef.current = true;
    void fetch(`/api/listening/attempts?paperId=${encodeURIComponent(paper.id)}&examSessionId=${encodeURIComponent(examSession)}&list=1`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { drafts?: AttemptChoice[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "草稿读取失败");
        const drafts = payload.drafts || [];
        if (drafts.length > 0) {
          setAttemptChoices(drafts);
          setEntryState("choosing");
          setDraftState("saved");
        } else {
          forceNewRef.current = true;
          restoredRef.current = true;
          setEntryState("started");
          setDraftState("saved");
          void persistDraft();
        }
      })
      .catch(() => setDraftState("error"));
  }, [examSession, paper.id, paper.sections, persistDraft]);

  async function resumeAttempt(id: string) {
    setEntryBusy(true);
    setDraftState("loading");
    try {
      const response = await fetch(`/api/listening/attempts?paperId=${encodeURIComponent(paper.id)}&examSessionId=${encodeURIComponent(examSession)}&attemptId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = await response.json() as { draft?: { id: string; answers: Record<string, string>; durationSeconds: number; startedAt?: string; progress?: { sectionIndex?: number; activeQuestion?: number; reviewedQuestions?: number[] } }; error?: string };
      if (!response.ok || !payload.draft) throw new Error(payload.error || "记录读取失败");
      attemptIdRef.current = payload.draft.id;
      setAnswers(payload.draft.answers || {});
      const wallTime = examSession && payload.draft.startedAt ? Math.floor((Date.now() - Date.parse(payload.draft.startedAt)) / 1000) : 0;
      setSecondsLeft(Math.max(0, DURATION_SECONDS - Math.max(payload.draft.durationSeconds, Number.isFinite(wallTime) ? wallTime : 0)));
      setSectionIndex(Math.min(paper.sections.length - 1, Math.max(0, payload.draft.progress?.sectionIndex || 0)));
      setActiveQuestion(payload.draft.progress?.activeQuestion || paper.sections[0]?.questions[0]?.number || 1);
      setReviewedQuestions(new Set(payload.draft.progress?.reviewedQuestions || []));
      restoredRef.current = true;
      setDraftState("saved");
      setEntryState("started");
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "记录读取失败");
      setDraftState("error");
    } finally {
      setEntryBusy(false);
    }
  }

  function restartAttempt() {
    attemptIdRef.current = null;
    forceNewRef.current = true;
    setAnswers({});
    setSecondsLeft(DURATION_SECONDS);
    setSectionIndex(initialSectionIndex);
    setActiveQuestion(paper.sections[initialSectionIndex]?.questions[0]?.number || 1);
    setReviewedQuestions(new Set());
    restoredRef.current = true;
    setDraftState("saved");
    setEntryState("started");
    window.setTimeout(() => void persistDraft(), 0);
  }

  useEffect(() => {
    if (!restoredRef.current || result) return;
    const debounce = window.setTimeout(() => void persistDraft(), 900);
    return () => window.clearTimeout(debounce);
  }, [activeQuestion, answers, persistDraft, result, reviewedQuestions, sectionIndex]);

  useEffect(() => {
    const interval = window.setInterval(() => void persistDraft(), 15_000);
    const flush = () => { if (document.visibilityState === "hidden") void persistDraft(); };
    document.addEventListener("visibilitychange", flush);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", flush); void persistDraft(); };
  }, [persistDraft]);

  useEffect(() => {
    if (entryState !== "started" || result || secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [entryState, result, secondsLeft]);

  useEffect(() => {
    if (secondsLeft === 0 && !result && !submitting) void submit();
    // Submit is intentionally triggered only when the timer reaches zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  function updateAnswer(number: number, value: string) {
    setAnswers((current) => ({ ...current, [String(number)]: value }));
  }

  function navigateToQuestion(number: number) {
    const nextSectionIndex = paper.sections.findIndex((item) => item.questions.some((question) => question.number === number));
    if (nextSectionIndex >= 0 && nextSectionIndex !== sectionIndex) setTranscriptProgress(null);
    if (nextSectionIndex >= 0) setSectionIndex(nextSectionIndex);
    setActiveQuestion(number);
  }

  function nextPart() {
    const nextIndex = sectionIndex + 1;
    if (nextIndex >= paper.sections.length) return;
    setTranscriptProgress(null);
    setSectionIndex(nextIndex);
    setActiveQuestion(paper.sections[nextIndex].questions[0]?.number ?? activeQuestion);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function continueMockExam(attemptId: string, band: number) {
    const response = await fetch("/api/mock-exams", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: examSession, skill: "listening", status: "completed", attemptId, band }) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || "模考进度保存失败");
    }
    router.replace(`${mockHref}?continue=1`);
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (activeQuestion === paper.sections[sectionIndex]?.questions[0]?.number) {
        window.scrollTo({ top: 0 });
        return;
      }
      const target = document.getElementById(`question-${activeQuestion}`);
      if (target) window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top - 180, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeQuestion, paper.sections, sectionIndex]);

  function toggleReview(number: number) {
    setReviewedQuestions((current) => {
      const next = new Set(current);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    restoredRef.current = false;
    try {
      const response = await fetch("/api/listening/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paperId: paper.id, examSessionId: examSession, attemptId: attemptIdRef.current, status: "submitted", answers, durationSeconds: DURATION_SECONDS - secondsLeft, localDate: localDateString(), progress: { sectionIndex, activeQuestion, reviewedQuestions: Array.from(reviewedQuestions) } }),
      });
      const payload = await response.json() as { attempt?: { id: string }; result?: Result; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "听力练习提交失败");
      attemptIdRef.current = payload.attempt?.id || attemptIdRef.current;
      window.speechSynthesis?.cancel();
      setResult(payload.result);
      if (examSession && payload.attempt?.id) await continueMockExam(payload.attempt.id, payload.result.bandScore);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      restoredRef.current = true;
      setError(submitError instanceof Error ? submitError.message : "听力练习提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    if (examSession) return <div className="exam-transition"><section className="card"><p className="eyebrow">LISTENING COMPLETE</p><h1>听力答卷已保存</h1><p>正在进入下一科。模考结束前不会显示答案与分数。</p>{error ? <p className="inline-error" role="alert">{error}</p> : null}<button className="button button-primary" disabled={submitting} onClick={() => { if (attemptIdRef.current) void continueMockExam(attemptIdRef.current, result.bandScore).catch((reason) => setError(reason instanceof Error ? reason.message : "模考进度保存失败")); }} type="button">继续考试 →</button></section></div>;
    return (
      <div className="reading-result-shell">
        <header className="reading-result-header"><Link className="exam-brand" href="/"><span>A</span> AI–IELTS</Link><Link className="button button-secondary" href="/practice/listening">返回听力题库</Link></header>
        <main className="reading-result-main">
          <section className="report-hero">
            <div><p className="eyebrow">IELTS LISTENING RESULT</p><h1>本次听力预估 Band {result.bandScore.toFixed(1)}</h1><p>已评分 {result.scoredCount} 题，答对 {result.correctCount} 题。分数已保存到当前账号。</p></div>
            <div className="band-orb"><span>Listening</span><strong>{result.bandScore.toFixed(1)}</strong><small>practice estimate</small></div>
          </section>
          <section className="card reading-review-card">
            <div className="section-title-row"><div><p className="eyebrow">ANSWER REVIEW</p><h2>答案复盘</h2></div><Link className="text-button" href="/review">进入 AI 错题诊断 →</Link></div>
            <div className="reading-review-list">{result.details.map((detail) => <div className="reading-review-item" key={detail.questionNumber}><span className={detail.correct ? "correct" : "wrong"}>{detail.correct ? "✓" : "×"}</span><strong>{detail.questionNumber}</strong><p>你的答案：{detail.answer || "未作答"}</p><p>标准答案：{detail.correctAnswer || "待核验"}</p></div>)}</div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="listening-shell">
      {entryState === "choosing" ? <AttemptResumeDialog attempts={attemptChoices} busy={entryBusy} onRestart={restartAttempt} onResume={(id) => void resumeAttempt(id)} /> : null}
      <header className="exam-topbar reading-topbar">
        <Link className="exam-brand" href="/"><span>A</span> AI–IELTS</Link>
        <div className="exam-meta"><span>ACADEMIC LISTENING</span><b>{paper.collectionTitle} · {paper.title}</b></div>
        <div className="exam-top-actions"><FullscreenButton /><details className="exam-utility"><summary>Help</summary><div>Listen once and enter each answer as you hear it. Use the question bar to move between questions or mark one for review.</div></details><div className={secondsLeft < 180 ? "exam-timer urgent" : "exam-timer"}><small>TIME REMAINING</small><strong>{formatTime(secondsLeft)}</strong></div></div>
      </header>
      <div className="reading-toolbar">
        <div className="passage-tabs">{paper.sections.map((item, index) => <button className={index === sectionIndex ? "active" : ""} key={item.id} onClick={() => { setTranscriptProgress(null); setSectionIndex(index); setActiveQuestion(item.questions[0]?.number ?? activeQuestion); }} type="button">Part {item.number}</button>)}</div>
        <div className="reading-toolbar-meta">
          <span>{answeredCount} / {totalQuestions} answered · {draftState === "loading" ? "正在恢复" : draftState === "saving" ? "正在保存" : draftState === "error" ? "保存失败" : "已自动保存"}</span>
          {!examSession ? <Link className="listening-mode-switch" href={mode === "exam" ? `/practice/listening/${paper.id}` : `/practice/listening/${paper.id}?mode=exam`}>
            {mode === "exam" ? "Practice review" : "Exam simulation"}
          </Link> : null}
        </div>
      </div>
      <main className="listening-practice-main">
        <section className="listening-section-intro">
          <div><p className="eyebrow">PART {section.number}</p><h1>Questions {section.questions[0]?.number}–{section.questions.at(-1)?.number}</h1><p>{section.context || section.title}</p></div>
          <span className="listening-mode-label">{mode === "exam" ? "EXAM SIMULATION" : "PRACTICE REVIEW"}</span>
        </section>
        <div className={mode === "exam" ? "listening-player-sticky" : undefined}><ListeningAudioPlayer initialTtsModel={initialTtsModel} initialTtsVoice={initialTtsVoice} key={section.id} mode={mode} onTranscriptProgress={setTranscriptProgress} section={section} prefetchSection={paper.sections[sectionIndex + 1]} ttsProvider={ttsProvider} /></div>
        <div className={mode === "practice" ? "listening-content-grid practice" : "listening-content-grid exam"}>
          {mode === "practice" ? <SyncedTranscript activeIndex={activeTranscriptIndex} cues={transcriptRows} onQuestionNavigate={navigateToQuestion} progress={transcriptProgress} /> : null}
          <section className="card listening-questions-card">
            <header><p className="eyebrow">QUESTIONS</p><h2>Questions {section.questions[0]?.number}–{section.questions.at(-1)?.number}</h2></header>
            {section.layoutHtml ? <IeltsQuestionLayout activeQuestion={activeQuestion} answers={answers} html={section.layoutHtml} onActivate={setActiveQuestion} onAnswer={updateAnswer} /> : null}
            {usesPartTwoLayout ? <IeltsListeningPartTwo activeQuestion={activeQuestion} answers={answers} onActivate={setActiveQuestion} onAnswer={updateAnswer} questions={section.questions} /> : null}
            {usesPartThreeLayout ? <IeltsListeningPartThree activeQuestion={activeQuestion} answers={answers} onActivate={setActiveQuestion} onAnswer={updateAnswer} questions={section.questions} /> : null}
            <div className="reading-question-list">{standardQuestions.map((question, questionIndex) => <article className={question.number === activeQuestion ? "reading-question active" : "reading-question"} id={`question-${question.number}`} key={question.number} onClick={() => setActiveQuestion(question.number)}><div className="reading-question-number">{question.number}</div><div><span className="question-type">{question.type || "Question"}</span>{question.instruction && (questionIndex === 0 || question.instruction !== standardQuestions[questionIndex - 1]?.instruction) && <p className="question-instruction">{formatExamText(question.instruction)}</p>}<p className="question-prompt">{formatExamText(question.prompt)}</p>{question.options.length > 0 ? <div className="question-options">{question.options.map((option) => <label key={option}><input checked={answers[String(question.number)] === option} name={`question-${question.number}`} onChange={() => updateAnswer(question.number, option)} type="radio" /><span>{formatExamText(option)}</span></label>)}</div> : <input className="reading-answer-input" aria-label={`Question ${question.number} answer`} onChange={(event) => updateAnswer(question.number, event.target.value)} placeholder={String(question.number)} value={answers[String(question.number)] || ""} />}</div></article>)}</div>
          </section>
        </div>
      </main>
      <ExamQuestionNavigator activeQuestion={activeQuestion} answeredQuestions={answeredQuestions} confirmSubmit={mode === "exam"} error={error} exitHref={examSession ? mockHref : "/practice/listening"} groups={questionGroups} onNavigate={navigateToQuestion} onNextPart={sectionIndex < paper.sections.length - 1 ? nextPart : undefined} onSubmit={() => void submit()} onToggleReview={toggleReview} reviewedQuestions={reviewedQuestions} submitLabel={sectionIndex < paper.sections.length - 1 ? `Next Part ${paper.sections[sectionIndex + 1].number} →` : "Finish Listening"} submitting={submitting} />
    </div>
  );
}
