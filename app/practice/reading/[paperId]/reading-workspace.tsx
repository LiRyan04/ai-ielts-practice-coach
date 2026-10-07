"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { localDateString } from "../../../../lib/learning/date";
import { formatExamText } from "../../../../lib/practice/format-exam-text";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReadingPaper } from "../../../../lib/reading/library";
import { ExamQuestionNavigator } from "../../../components/exam-question-navigator";
import { ExamSplitPane } from "../../../components/exam-split-pane";
import { FullscreenButton } from "../../../components/fullscreen-button";
import { AttemptResumeDialog, type AttemptChoice } from "../../../components/attempt-resume-dialog";
import { IeltsQuestionLayout } from "../../../components/ielts-question-layout";
import { ReadingPassageThreeLayout, ReadingPassageTwoLayout } from "../../../components/ielts-reading-test-one-layouts";

const DURATION_SECONDS = 60 * 60;

type Result = {
  correctCount: number;
  scoredCount: number;
  bandScore: number;
  details: Array<{
    questionNumber: number;
    answer: string;
    correctAnswer: string | null;
    scorable: boolean;
    correct: boolean | null;
  }>;
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function articleParagraphs(article: string) {
  return article.split(/\n\s*\n/u).map((paragraph) => paragraph.trim()).filter(Boolean);
}

function truthChoiceType(options: string[]) {
  const values = options.map((option) => option.trim().toUpperCase());
  if (values.join("|") === "TRUE|FALSE|NOT GIVEN") return "TRUE";
  if (values.join("|") === "YES|NO|NOT GIVEN") return "YES";
  return null;
}

function splitLetteredOption(option: string) {
  const match = option.match(/^([A-I])[.)]\s*(.*)$/);
  return match ? { letter: match[1], text: match[2] } : null;
}

export function ReadingWorkspace({ paper, initialPassage, examSession = "", mockTest = 0 }: { paper: ReadingPaper; initialPassage: number; examSession?: string; mockTest?: number }) {
  const router = useRouter();
  const mockHref = `/mock/${paper.collectionId}/${mockTest}`;
  const initialPassageIndex = Math.min(paper.passages.length - 1, Math.max(0, initialPassage - 1));
  const [passageIndex, setPassageIndex] = useState(initialPassageIndex);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(DURATION_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [activeQuestion, setActiveQuestion] = useState(paper.passages[initialPassageIndex]?.questions[0]?.number ?? 1);
  const [reviewedQuestions, setReviewedQuestions] = useState<Set<number>>(() => new Set());
  const [draftState, setDraftState] = useState<"loading" | "saving" | "saved" | "error">("loading");
  const [entryState, setEntryState] = useState<"loading" | "choosing" | "started">("loading");
  const [attemptChoices, setAttemptChoices] = useState<AttemptChoice[]>([]);
  const [entryBusy, setEntryBusy] = useState(false);
  const attemptIdRef = useRef<string | null>(null);
  const articlePanelRef = useRef<HTMLElement>(null);
  const questionPanelRef = useRef<HTMLElement>(null);
  const forceNewRef = useRef(false);
  const entryCheckStartedRef = useRef(false);
  const restoredRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const draftSnapshotRef = useRef({ answers, passageIndex, activeQuestion, reviewedQuestions: [] as number[], durationSeconds: 0 });
  const passage = paper.passages[passageIndex];
  const usesPassageTwoLayout = passage.id === "academic21-reading-1-p2";
  const usesPassageThreeLayout = passage.id === "academic21-reading-1-p3";
  const layoutQuestionNumbers = useMemo(() => new Set(passage.layoutQuestionNumbers || []), [passage.layoutQuestionNumbers]);
  const standardQuestions = useMemo(() => passage.questions.filter((question) => !layoutQuestionNumbers.has(question.number) && !usesPassageTwoLayout && !usesPassageThreeLayout), [layoutQuestionNumbers, passage.questions, usesPassageThreeLayout, usesPassageTwoLayout]);
  const truthChoiceGroup = standardQuestions.length > 0 && standardQuestions.every((question) => truthChoiceType(question.options) === truthChoiceType(standardQuestions[0].options))
    ? truthChoiceType(standardQuestions[0].options)
    : null;
  const totalQuestions = useMemo(() => paper.passages.reduce((sum, item) => sum + item.questions.length, 0), [paper]);
  const answeredCount = Object.values(answers).filter((answer) => answer.trim()).length;
  const answeredQuestions = useMemo(() => new Set(Object.entries(answers).filter(([, answer]) => answer.trim()).map(([number]) => Number(number))), [answers]);
  const questionGroups = useMemo(() => paper.passages.map((item) => ({ label: `Passage ${item.number}`, questions: item.questions.map((question) => question.number) })), [paper]);

  useEffect(() => {
    draftSnapshotRef.current = { answers, passageIndex, activeQuestion, reviewedQuestions: Array.from(reviewedQuestions), durationSeconds: DURATION_SECONDS - secondsLeft };
  }, [activeQuestion, answers, passageIndex, reviewedQuestions, secondsLeft]);

  const persistDraft = useCallback(async () => {
    if (!restoredRef.current || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setDraftState("saving");
    const snapshot = draftSnapshotRef.current;
    try {
      const response = await fetch("/api/reading/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paperId: paper.id, examSessionId: examSession, attemptId: attemptIdRef.current, forceNew: forceNewRef.current, status: "draft", answers: snapshot.answers, durationSeconds: snapshot.durationSeconds, progress: { passageIndex: snapshot.passageIndex, activeQuestion: snapshot.activeQuestion, reviewedQuestions: snapshot.reviewedQuestions } }),
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
    void fetch(`/api/reading/attempts?paperId=${encodeURIComponent(paper.id)}&examSessionId=${encodeURIComponent(examSession)}&list=1`, { cache: "no-store" })
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
  }, [examSession, paper.id, paper.passages, persistDraft]);

  async function resumeAttempt(id: string) {
    setEntryBusy(true);
    setDraftState("loading");
    try {
      const response = await fetch(`/api/reading/attempts?paperId=${encodeURIComponent(paper.id)}&examSessionId=${encodeURIComponent(examSession)}&attemptId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = await response.json() as { draft?: { id: string; answers: Record<string, string>; durationSeconds: number; startedAt?: string; progress?: { passageIndex?: number; activeQuestion?: number; reviewedQuestions?: number[] } }; error?: string };
      if (!response.ok || !payload.draft) throw new Error(payload.error || "记录读取失败");
      attemptIdRef.current = payload.draft.id;
      setAnswers(payload.draft.answers || {});
      const wallTime = examSession && payload.draft.startedAt ? Math.floor((Date.now() - Date.parse(payload.draft.startedAt)) / 1000) : 0;
      setSecondsLeft(Math.max(0, DURATION_SECONDS - Math.max(payload.draft.durationSeconds, Number.isFinite(wallTime) ? wallTime : 0)));
      setPassageIndex(Math.min(paper.passages.length - 1, Math.max(0, payload.draft.progress?.passageIndex || 0)));
      setActiveQuestion(payload.draft.progress?.activeQuestion || paper.passages[0]?.questions[0]?.number || 1);
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
    setPassageIndex(initialPassageIndex);
    setActiveQuestion(paper.passages[initialPassageIndex]?.questions[0]?.number || 1);
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
  }, [activeQuestion, answers, passageIndex, persistDraft, result, reviewedQuestions]);

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
    // submit is intentionally triggered only by the timer reaching zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  function updateAnswer(number: number, value: string) {
    setAnswers((current) => ({ ...current, [String(number)]: value }));
  }

  function navigateToQuestion(number: number) {
    const nextPassageIndex = paper.passages.findIndex((item) => item.questions.some((question) => question.number === number));
    if (nextPassageIndex >= 0) setPassageIndex(nextPassageIndex);
    setActiveQuestion(number);
  }

  function nextPassage() {
    const nextIndex = passageIndex + 1;
    if (nextIndex >= paper.passages.length) return;
    setPassageIndex(nextIndex);
    setActiveQuestion(paper.passages[nextIndex].questions[0]?.number ?? activeQuestion);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function continueMockExam(attemptId: string, band: number) {
    const response = await fetch("/api/mock-exams", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: examSession, skill: "reading", status: "completed", attemptId, band }) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || "模考进度保存失败");
    }
    router.replace(`${mockHref}?continue=1`);
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const panel = questionPanelRef.current;
      const target = document.getElementById(`question-${activeQuestion}`);
      if (!panel || !target) return;
      if (activeQuestion === paper.passages[passageIndex]?.questions[0]?.number) {
        articlePanelRef.current?.scrollTo({ top: 0 });
        panel.scrollTo({ top: 0 });
        return;
      }
      if (window.getComputedStyle(panel).overflowY === "auto") {
        const offset = target.getBoundingClientRect().top - panel.getBoundingClientRect().top;
        panel.scrollTo({ top: panel.scrollTop + offset - 92, behavior: "smooth" });
      } else target.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeQuestion, paper.passages, passageIndex]);

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
      const response = await fetch("/api/reading/attempts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paperId: paper.id,
          attemptId: attemptIdRef.current,
          examSessionId: examSession,
          status: "submitted",
          answers,
          durationSeconds: DURATION_SECONDS - secondsLeft,
          localDate: localDateString(),
          progress: { passageIndex, activeQuestion, reviewedQuestions: Array.from(reviewedQuestions) },
        }),
      });
      const payload = await response.json() as { attempt?: { id: string }; result?: Result; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "阅读练习提交失败");
      attemptIdRef.current = payload.attempt?.id || attemptIdRef.current;
      setResult(payload.result);
      if (examSession && payload.attempt?.id) await continueMockExam(payload.attempt.id, payload.result.bandScore);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      restoredRef.current = true;
      setError(submitError instanceof Error ? submitError.message : "阅读练习提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    if (examSession) return <div className="exam-transition"><section className="card"><p className="eyebrow">READING COMPLETE</p><h1>阅读答卷已保存</h1><p>正在进入下一科。模考结束前不会显示答案与分数。</p>{error ? <p className="inline-error" role="alert">{error}</p> : null}<button className="button button-primary" disabled={submitting} onClick={() => { if (attemptIdRef.current) void continueMockExam(attemptIdRef.current, result.bandScore).catch((reason) => setError(reason instanceof Error ? reason.message : "模考进度保存失败")); }} type="button">继续考试 →</button></section></div>;
    return (
      <div className="reading-result-shell">
        <header className="reading-result-header">
          <Link className="exam-brand" href="/"><span>A</span> AI–IELTS</Link>
          <Link className="button button-secondary" href="/library">返回题库</Link>
        </header>
        <main className="reading-result-main">
          <section className="report-hero">
            <div>
              <p className="eyebrow">ACADEMIC READING RESULT</p>
              <h1>本次阅读预估 Band {result.bandScore.toFixed(1)}</h1>
              <p>已评分 {result.scoredCount} 题，答对 {result.correctCount} 题。缺少标准答案的导入题不会计入分数。</p>
            </div>
            <div className="band-orb"><span>Reading</span><strong>{result.bandScore.toFixed(1)}</strong><small>practice estimate</small></div>
          </section>
          <section className="card reading-review-card">
            <div className="section-title-row"><div><p className="eyebrow">ANSWER REVIEW</p><h2>答案复盘</h2></div><Link className="text-button" href="/review">进入 AI 错题诊断 →</Link></div>
            <div className="reading-review-list">
              {result.details.map((detail) => (
                <div className="reading-review-item" key={detail.questionNumber}>
                  <span className={detail.scorable ? (detail.correct ? "correct" : "wrong") : "unscored"}>
                    {detail.scorable ? (detail.correct ? "✓" : "×") : "—"}
                  </span>
                  <strong>{detail.questionNumber}</strong>
                  <p>你的答案：{detail.answer || "未作答"}</p>
                  <p>标准答案：{detail.correctAnswer || "待核验"}</p>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="reading-shell">
      {entryState === "choosing" ? <AttemptResumeDialog attempts={attemptChoices} busy={entryBusy} onRestart={restartAttempt} onResume={(id) => void resumeAttempt(id)} /> : null}
      <header className="exam-topbar reading-topbar">
        <Link className="exam-brand" href="/"><span>A</span> AI–IELTS</Link>
        <div className="exam-meta"><span>ACADEMIC READING</span><b>{paper.collectionTitle} · {paper.title}</b></div>
        <div className="exam-top-actions"><FullscreenButton /><details className="exam-utility"><summary>Help</summary><div>Read the passage on the left and answer on the right. Use the question bar to move between questions or mark one for review.</div></details><div className={secondsLeft < 300 ? "exam-timer urgent" : "exam-timer"}><small>TIME REMAINING</small><strong>{formatTime(secondsLeft)}</strong></div></div>
      </header>
      <div className="reading-toolbar">
        <div className="passage-tabs">
          {paper.passages.map((item, index) => (
            <button className={index === passageIndex ? "active" : ""} key={item.id} onClick={() => { setPassageIndex(index); setActiveQuestion(item.questions[0]?.number ?? activeQuestion); }} type="button">
              Passage {item.number}
            </button>
          ))}
        </div>
        <span>{answeredCount} / {totalQuestions} answered · {draftState === "loading" ? "正在恢复" : draftState === "saving" ? "正在保存" : draftState === "error" ? "保存失败" : "已自动保存"}</span>
      </div>
      <ExamSplitPane className="reading-practice-grid" left={
        <article className="reading-article-panel" ref={articlePanelRef}>
          <p className="reading-passage-label">PASSAGE {passage.number}</p>
          <p className="reading-passage-guidance">You should spend about 20 minutes on Questions {passage.questions[0]?.number}–{passage.questions.at(-1)?.number}, which are based on Reading Passage {passage.number}.</p>
          <h1>{passage.title}</h1>
          {passage.summary && <p className="reading-summary">{passage.summary}</p>}
          <div className="reading-article-copy">
            {articleParagraphs(passage.article).map((paragraph, index) => <p className={/^[A-G]$/.test(paragraph) ? "reading-section-letter" : ""} key={index}>{formatExamText(paragraph)}</p>)}
          </div>
        </article>
      } right={
        <section className="reading-question-panel" ref={questionPanelRef}>
          <header><p className="eyebrow">QUESTIONS</p><h2>Questions {passage.questions[0]?.number}–{passage.questions.at(-1)?.number}</h2></header>
          {usesPassageTwoLayout ? (
            <ReadingPassageTwoLayout activeQuestion={activeQuestion} answers={answers} onActivate={setActiveQuestion} onAnswer={updateAnswer} questions={passage.questions} summaryLayout={passage.layoutHtml ? <IeltsQuestionLayout activeQuestion={activeQuestion} answers={answers} html={passage.layoutHtml} onActivate={setActiveQuestion} onAnswer={updateAnswer} /> : null} />
          ) : usesPassageThreeLayout ? (
            <ReadingPassageThreeLayout activeQuestion={activeQuestion} answers={answers} onActivate={setActiveQuestion} onAnswer={updateAnswer} questions={passage.questions} />
          ) : passage.layoutHtml ? <IeltsQuestionLayout activeQuestion={activeQuestion} answers={answers} html={passage.layoutHtml} onActivate={setActiveQuestion} onAnswer={updateAnswer} /> : null}
          {truthChoiceGroup ? (
            <div className="ielts-choice-group-intro">
              <strong>Questions {standardQuestions[0]?.number}–{standardQuestions.at(-1)?.number}</strong>
              <p>{truthChoiceGroup === "TRUE" ? `Do the following statements agree with the information given in Reading Passage ${passage.number}?` : `Do the following statements agree with the views of the writer in Reading Passage ${passage.number}?`}</p>
              <p>Choose:</p>
              <dl>
                <div><dt>{truthChoiceGroup}</dt><dd>if the statement agrees with the information</dd></div>
                <div><dt>{truthChoiceGroup === "TRUE" ? "FALSE" : "NO"}</dt><dd>if the statement contradicts the information</dd></div>
                <div><dt>NOT GIVEN</dt><dd>if there is no information on this</dd></div>
              </dl>
            </div>
          ) : null}
          <div className="reading-question-list">
            {standardQuestions.map((question, questionIndex) => (
              <article className={question.number === activeQuestion ? "reading-question active" : "reading-question"} id={`question-${question.number}`} key={question.number} onClick={() => setActiveQuestion(question.number)}>
                <div className="reading-question-number">{question.number}</div>
                <div>
                  <span className="question-type">{question.type || "Question"}</span>
                  {!truthChoiceGroup && question.instruction && (questionIndex === 0 || question.instruction !== standardQuestions[questionIndex - 1]?.instruction) && <p className="question-instruction">{formatExamText(question.instruction)}</p>}
                  <p className="question-prompt">{formatExamText(question.prompt)}</p>
                  {question.options.length > 0 ? (
                    <div className="question-options">
                      {question.options.map((option) => (
                        <label key={option}><input checked={answers[String(question.number)] === option} name={`question-${question.number}`} onChange={() => updateAnswer(question.number, option)} type="radio" />{splitLetteredOption(option) ? <><b>{splitLetteredOption(option)?.letter}.</b><span>{splitLetteredOption(option)?.text}</span></> : <span>{option}</span>}</label>
                      ))}
                    </div>
                  ) : (
                    <input className="reading-answer-input" aria-label={`Question ${question.number} answer`} onChange={(event) => updateAnswer(question.number, event.target.value)} placeholder={String(question.number)} value={answers[String(question.number)] || ""} />
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      } />
      <ExamQuestionNavigator activeQuestion={activeQuestion} answeredQuestions={answeredQuestions} confirmSubmit={Boolean(examSession)} error={error} exitHref={examSession ? mockHref : "/library"} groups={questionGroups} onNavigate={navigateToQuestion} onNextPart={passageIndex < paper.passages.length - 1 ? nextPassage : undefined} onSubmit={() => void submit()} onToggleReview={toggleReview} reviewedQuestions={reviewedQuestions} submitLabel={passageIndex < paper.passages.length - 1 ? `Next Passage ${paper.passages[passageIndex + 1].number} →` : "Finish Reading"} submitting={submitting} />
    </div>
  );
}
