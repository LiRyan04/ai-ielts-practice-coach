"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { countWords, validateEssay } from "../../../lib/writing/rules";
import type { WritingPrompt, WritingVisual } from "../../../lib/writing/library";
import { localDateString } from "../../../lib/learning/date";
import { ExamSplitPane } from "../../components/exam-split-pane";
import { FullscreenButton } from "../../components/fullscreen-button";

type Criterion = { name: string; score: number; rationale: string };
type Annotation = { quote: string; category: string; explanation: string; suggestion: string };
type Assessment = {
  overallBand: number;
  confidence: "low" | "medium" | "high";
  criteria: Criterion[];
  summary: string;
  strengths: string[];
  issues: string[];
  sentenceAnnotations: Annotation[];
  rewritePrompts: string[];
  suggestedRevision: string;
  sampleAnswer: string;
  model: string;
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function WritingWorkspace({ prompt }: { prompt: WritingPrompt }) {
  const router = useRouter();
  const durationSeconds = prompt.taskType === "task1" ? 20 * 60 : 40 * 60;
  const targetWords = prompt.taskType === "task1" ? 150 : 250;
  const [essay, setEssay] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [timerRunning, setTimerRunning] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const attemptIdRef = useRef<string | null>(null);
  const activeSave = useRef<Promise<string | null> | null>(null);
  const wordCount = useMemo(() => countWords(essay), [essay]);
  const paragraphCount = useMemo(() => essay.trim() ? essay.trim().split(/\n\s*\n/u).filter(Boolean).length : 0, [essay]);
  const wordsRemaining = Math.max(0, targetWords - wordCount);
  const completion = Math.min(100, Math.round((wordCount / targetWords) * 100));
  const assessmentPrompt = useMemo(() => prompt.visual
    ? `${prompt.prompt}\n\nAuthoritative chart data (use this to verify factual accuracy; do not infer values from an image):\n${JSON.stringify(prompt.visual)}`
    : prompt.prompt, [prompt]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/writing/attempts?promptId=${encodeURIComponent(prompt.id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { draft?: { id: string; content: string; durationSeconds: number }; error?: string };
        if (!response.ok) throw new Error(payload.error || "作文草稿读取失败");
        if (payload.draft) {
          attemptIdRef.current = payload.draft.id;
          setEssay(payload.draft.content);
          setSecondsLeft(Math.max(0, durationSeconds - payload.draft.durationSeconds));
          setSaveState("saved");
        }
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "作文草稿读取失败");
      });
    return () => controller.abort();
  }, [durationSeconds, prompt.id]);

  useEffect(() => {
    if (!timerRunning || secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning, secondsLeft]);

  const persistDraft = useCallback(async (status: "draft" | "submitted" = "draft") => {
    if (!essay.trim()) return attemptIdRef.current;
    if (activeSave.current) {
      const savedId = await activeSave.current;
      if (!savedId) return savedId;
    }
    setSaveState("saving");
    const currentAttemptId = attemptIdRef.current;
    const operation = (async () => {
      const url = currentAttemptId ? `/api/writing/attempts/${currentAttemptId}` : "/api/writing/attempts";
      const response = await fetch(url, {
        method: currentAttemptId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          promptId: prompt.id,
          taskType: prompt.taskType,
          content: essay,
          wordCount,
          durationSeconds: durationSeconds - secondsLeft,
          status,
          localDate: localDateString(),
        }),
      });
      const payload = await response.json() as { attempt?: { id: string }; error?: string };
      if (!response.ok || !payload.attempt) throw new Error(payload.error || "保存失败");
      attemptIdRef.current = payload.attempt.id;
      setSaveState("saved");
      return payload.attempt.id;
    })();
    activeSave.current = operation;
    try {
      return await operation;
    } catch (saveError) {
      setSaveState("error");
      setError(saveError instanceof Error ? saveError.message : "作文保存失败");
      return null;
    } finally {
      if (activeSave.current === operation) activeSave.current = null;
    }
  }, [durationSeconds, essay, prompt.id, prompt.taskType, secondsLeft, wordCount]);

  useEffect(() => {
    if (!essay.trim()) return;
    const debounce = window.setTimeout(() => void persistDraft(), 1200);
    return () => window.clearTimeout(debounce);
  }, [essay, persistDraft]);

  async function submitForAssessment() {
    setError(null);
    const validation = validateEssay(essay, prompt.taskType);
    if (!validation.valid) {
      setError(validation.errors.join(" "));
      return;
    }
    setSubmitting(true);
    setTimerRunning(false);
    const savedAttemptId = await persistDraft("submitted");
    if (!savedAttemptId) {
      setSubmitting(false);
      return;
    }
    const examSession = new URLSearchParams(window.location.search).get("examSession");
    if (examSession) void fetch("/api/mock-exams", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: examSession, skill: "writing", status: "completed", attemptId: savedAttemptId }) });
    try {
      const response = await fetch("/api/writing/assess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ attemptId: savedAttemptId, promptId: prompt.id, taskType: prompt.taskType, prompt: assessmentPrompt, essay }),
      });
      const payload = await response.json() as { assessment?: Assessment; error?: string; code?: string };
      if (!response.ok || !payload.assessment) {
        if (payload.code === "AI_NOT_CONFIGURED") {
          throw new Error(`作文已安全保存。${payload.error || "请先在设置中完成文本 AI Provider 配置，再重新请求评分。"}`);
        }
        throw new Error(payload.error || "AI 评分暂时不可用");
      }
      setAssessment(payload.assessment);
      if (examSession) void fetch("/api/mock-exams", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: examSession, skill: "writing", status: "completed", attemptId: savedAttemptId, band: payload.assessment.overallBand }) });
    } catch (assessmentError) {
      setError(assessmentError instanceof Error ? assessmentError.message : "AI 评分暂时不可用");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveAndExit() {
    if (leaving) return;
    setLeaving(true);
    if (essay.trim()) {
      const savedAttemptId = await persistDraft();
      if (!savedAttemptId) {
        setLeaving(false);
        return;
      }
    }
    router.push("/");
  }

  if (assessment) {
    return <AssessmentView assessment={assessment} essay={essay} onBack={() => setAssessment(null)} />;
  }

  return (
    <div className="exam-shell">
      <header className="exam-topbar">
        <Link className="exam-brand" href="/"><span>A</span> AI–IELTS</Link>
        <div className="exam-meta"><span>ACADEMIC WRITING</span><b>{prompt.taskType === "task1" ? "Task 1" : "Task 2"}</b></div>
        <div className="exam-top-actions"><FullscreenButton /><details className="exam-utility"><summary>Help</summary><div>Write your response in the answer area. Your work is saved automatically and the word count updates as you type.</div></details><div className={secondsLeft < 300 ? "exam-timer urgent" : "exam-timer"}><small>TIME REMAINING</small><strong>{formatTime(secondsLeft)}</strong><button className="timer-pause-button" data-state={timerRunning ? "running" : "paused"} type="button" onClick={() => setTimerRunning((value) => !value)} aria-label={timerRunning ? "暂停练习计时" : "继续练习计时"}><span aria-hidden="true" /></button></div></div>
      </header>

      <div className="exam-toolbar">
        <div><span className="tab-button active">{prompt.taskType === "task1" ? "Task 1" : "Task 2"}</span></div>
        <div className="save-indicator" aria-live="polite">
          <i className={saveState === "error" ? "error" : ""} />
          {saveState === "saving" ? "正在保存" : saveState === "saved" ? "已保存到账号" : saveState === "error" ? "保存失败" : "账号自动保存"}
        </div>
      </div>

      <ExamSplitPane className="writing-grid" left={
        <section className="prompt-panel">
          <p className="eyebrow">WRITING {prompt.taskType === "task1" ? "TASK 1" : "TASK 2"}</p>
          <h1>{prompt.title}</h1>
          <div className="prompt-copy"><p>{prompt.prompt}</p></div>
          {prompt.imageUrl ? <Image className="writing-task-image" src={prompt.imageUrl} alt={`${prompt.title} task visual`} width={1200} height={800} /> : null}
          {prompt.visual ? <TaskVisual visual={prompt.visual} /> : null}
          <div className="task-guidance">
            <strong>Write at least {targetWords} words.</strong>
            <p>{prompt.taskType === "task1" ? "Summarise the information by selecting and reporting the main features, and make comparisons where relevant." : "Give reasons for your answer and include any relevant examples from your own knowledge or experience."}</p>
          </div>
          <div className="prompt-note"><span>i</span><p>建议用时 {prompt.taskType === "task1" ? 20 : 40} 分钟。{prompt.source.startsWith("ai:") ? "这是 AI 生成题目，建议完成后核验题意与数据。" : prompt.taskType === "task1" ? "先概括整体趋势，再选择关键数据进行比较，不需要逐项罗列。" : "Task 2 在写作总分中的权重高于 Task 1。"}</p></div>
        </section>
      } right={
        <section className="editor-panel">
          <textarea
            aria-label={`Writing ${prompt.taskType === "task1" ? "Task 1" : "Task 2"} 作文`}
            autoFocus
            value={essay}
            onChange={(event) => {
              setEssay(event.target.value);
              setSaveState("idle");
            }}
            placeholder="Start writing your essay here…"
            spellCheck
          />
          <div className="editor-footer">
            <div className="word-progress"><span><b>{wordCount}</b> / {targetWords} words</span><div className="progress-track"><i style={{ width: `${completion}%` }} /></div></div>
            <span>{paragraphCount} 段 · {essay.length.toLocaleString("en-US")} characters{wordsRemaining ? ` · 还差 ${wordsRemaining} 词` : " · 已达到最低字数"}</span>
          </div>
        </section>
      } />

      <footer className="exam-footer">
        <div>{error ? <p className="inline-error" role="alert">{error}</p> : <span className="exam-hint">交卷后将生成四项评分、逐句问题和重写任务。</span>}</div>
        <div className="exam-actions"><button className="button button-secondary" type="button" disabled={leaving || submitting} onClick={() => void saveAndExit()}>{leaving ? "正在保存…" : "保存并退出"}</button><button className="button button-primary" type="button" disabled={submitting || leaving} onClick={submitForAssessment}>{submitting ? "正在评分…" : "提交并获取 AI 评分 →"}</button></div>
      </footer>
    </div>
  );
}

const CHART_COLORS = ["#245f85", "#b56b38", "#4f846c", "#795b94"];

function TaskChart({ visual, large = false }: { visual: WritingVisual; large?: boolean }) {
  const width = 680;
  const height = 360;
  const chartClass = large ? "task-chart large" : "task-chart";
  if (visual.type === "image") return <Image alt={visual.title} className={chartClass} height={850} src={visual.dataUrl} unoptimized width={1200} />;
  if (visual.type === "process") {
    const stepWidth = 540 / visual.steps.length;
    return <svg aria-label={visual.title} className={chartClass} role="img" viewBox={`0 0 ${width} ${height}`}>
      <title>{visual.title}</title><text className="chart-title" textAnchor="middle" x={width / 2} y="28">{visual.title}</text>
      {visual.subtitle ? <text className="chart-subtitle" textAnchor="middle" x={width / 2} y="48">{visual.subtitle}</text> : null}
      {visual.steps.map((step, index) => {
        const x = 55 + index * stepWidth;
        return <g key={`${step.title}-${index}`}><rect className="process-step" height="112" rx="8" width={Math.max(86, stepWidth - 28)} x={x} y="105" /><text className="process-number" textAnchor="middle" x={x + (stepWidth - 28) / 2} y="92">{index + 1}</text><text className="chart-legend" textAnchor="middle" x={x + (stepWidth - 28) / 2} y="137"><tspan x={x + (stepWidth - 28) / 2}>{step.title}</tspan>{step.description.match(/.{1,20}(?:\s|$)/gu)?.slice(0, 3).map((line, lineIndex) => <tspan className="chart-subtitle" dy="18" key={lineIndex} x={x + (stepWidth - 28) / 2}>{line.trim()}</tspan>)}</text>{index < visual.steps.length - 1 ? <path className="process-arrow" d={`M ${x + stepWidth - 23} 161 h 18`} /> : null}</g>;
      })}
    </svg>;
  }
  if (visual.type === "map") {
    const panel = { width: 280, height: 242, innerX: 20, innerY: 42, innerWidth: 240, innerHeight: 176 };
    const absent = (description: string) => /\b(absent|not present|no longer|removed|demolished|undeveloped|empty)\b/iu.test(description);
    const feature = (place: (typeof visual.places)[number], periodIndex: number, index: number) => {
      const description = periodIndex ? place.after : place.before;
      if (absent(description)) return null;
      const position = periodIndex ? place.afterPosition : place.beforePosition;
      const x = panel.innerX + position.x / 100 * panel.innerWidth;
      const y = panel.innerY + position.y / 100 * panel.innerHeight;
      const color = place.kind === "green" ? "#79a86f" : place.kind === "water" ? "#78aeca" : place.kind === "road" ? "#8a9298" : place.kind === "facility" ? "#c69058" : CHART_COLORS[index % CHART_COLORS.length];
      const scale = place.size === "large" ? 1.22 : place.size === "small" ? .78 : 1;
      return <g aria-label={`${place.name}: ${description}`} className={`map-feature ${place.kind}`} key={`${periodIndex}-${place.name}`} transform={`translate(${x}, ${y})`}>
        <g transform={`scale(${scale})`}>{place.kind === "green" ? <><circle cx="-8" cy="0" fill={color} r="12" /><circle cx="7" cy="-5" fill={color} r="14" /><circle cx="11" cy="8" fill={color} opacity=".85" r="10" /></>
          : place.kind === "water" ? <path d="M -25 3 Q -13 -11 0 2 T 25 1 Q 12 17 0 8 T -25 3" fill={color} stroke="#4c8aa9" strokeWidth="1.5" />
            : place.kind === "road" ? <><path d="M -31 0 H 31" stroke="#747d83" strokeWidth="10" /><path d="M -31 0 H 31" stroke="#fff" strokeDasharray="7 6" strokeWidth="1.5" /></>
              : place.kind === "facility" ? <><rect fill={color} height="30" rx="8" stroke="#fff" strokeWidth="2" width="48" x="-24" y="-15" /><circle cx="-12" cy="0" fill="#fff" opacity=".6" r="4" /><circle cx="12" cy="0" fill="#fff" opacity=".6" r="4" /></>
                : <><rect fill={color} height="29" rx="3" stroke="#fff" strokeWidth="2" width="45" x="-22.5" y="-14.5" /><path d="M -27 -14 L 0 -28 L 27 -14" fill={color} stroke="#fff" strokeWidth="2" /></>}</g>
        <rect className="map-label-bg" height="17" rx="3" width="74" x="-37" y="21" />
        <text className="map-label" textAnchor="middle" y="33">{place.name.length > 11 ? `${place.name.slice(0, 10)}…` : place.name}</text>
      </g>;
    };
    return <svg aria-label={visual.title} className={chartClass} role="img" viewBox={`0 0 ${width} ${height}`}>
      <defs><pattern height="16" id="map-grid" patternUnits="userSpaceOnUse" width="16"><path d="M 16 0 L 0 0 0 16" fill="none" stroke="#dbe3de" strokeWidth=".7" /></pattern><filter height="140%" id="map-shadow" width="140%" x="-20%" y="-20%"><feDropShadow dx="0" dy="2" floodColor="#31434d" floodOpacity=".18" stdDeviation="2" /></filter></defs>
      <title>{visual.title}</title><text className="chart-title" textAnchor="middle" x={width / 2} y="25">{visual.title}</text>
      {visual.subtitle ? <text className="chart-subtitle" textAnchor="middle" x={width / 2} y="44">{visual.subtitle}</text> : null}
      {["Before", "After"].map((period, periodIndex) => {
        const originX = 45 + periodIndex * 310;
        return <g key={period} transform={`translate(${originX}, 68)`}>
          <rect className="map-panel" filter="url(#map-shadow)" height={panel.height} rx="8" width={panel.width} />
          <rect fill="url(#map-grid)" height={panel.innerHeight} rx="5" width={panel.innerWidth} x={panel.innerX} y={panel.innerY} />
          <text className="map-period" x="18" y="27">{period}</text>
          <g className="map-compass" transform="translate(246, 23)"><path d="M 0 -12 L 5 5 L 0 2 L -5 5 Z" /><text textAnchor="middle" y="-15">N</text></g>
          {visual.places.map((place, index) => feature(place, periodIndex, index))}
        </g>;
      })}
      <g className="map-change-key" transform="translate(45, 330)">{visual.places.slice(0, 4).map((place, index) => <g key={place.name} transform={`translate(${index * 150}, 0)`}><circle cx="5" cy="-4" fill={CHART_COLORS[index % CHART_COLORS.length]} r="4" /><text className="chart-subtitle" x="14">{place.name}: {place.after.slice(0, 18)}</text></g>)}</g>
    </svg>;
  }
  if (visual.type === "table") {
    const cellWidth = 540 / (visual.series.length + 1);
    return <svg aria-label={visual.title} className={chartClass} role="img" viewBox={`0 0 ${width} ${height}`}>
      <title>{visual.title}</title><text className="chart-title" textAnchor="middle" x={width / 2} y="28">{visual.title}</text>
      {[["Category", ...visual.series.map((series) => series.name)], ...visual.categories.map((category, index) => [category, ...visual.series.map((series) => `${series.values[index]}${visual.unit}`)])].map((row, rowIndex) => row.map((cell, columnIndex) => <g key={`${rowIndex}-${columnIndex}`}><rect className={rowIndex === 0 ? "table-cell table-head" : "table-cell"} height="42" width={cellWidth} x={70 + columnIndex * cellWidth} y={70 + rowIndex * 42} /><text className="chart-legend" textAnchor="middle" x={70 + columnIndex * cellWidth + cellWidth / 2} y={96 + rowIndex * 42}>{cell}</text></g>))}
    </svg>;
  }
  if (visual.type === "pie") {
    const values = visual.series[0]?.values || [];
    const total = values.reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
    const lengths = values.map((value) => Math.max(0, value) / total * 100);
    return <svg aria-label={visual.title} className={chartClass} role="img" viewBox={`0 0 ${width} ${height}`}>
      <title>{visual.title}</title><text className="chart-title" textAnchor="middle" x={width / 2} y="28">{visual.title}</text>
      <g transform="rotate(-90 250 190)">{lengths.map((length, index) => <circle cx="250" cy="190" fill="none" key={visual.categories[index]} pathLength="100" r="105" stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-lengths.slice(0, index).reduce((sum, segment) => sum + segment, 0)} strokeWidth="72" />)}</g>
      {visual.categories.map((category, index) => <g key={category} transform={`translate(410, ${105 + index * 42})`}><rect fill={CHART_COLORS[index % CHART_COLORS.length]} height="13" rx="2" width="13" /><text className="chart-legend" x="22" y="11">{category}: {values[index]}{visual.unit}</text></g>)}
    </svg>;
  }
  const plot = { left: 70, top: 62, width: 550, height: 220 };
  const maxValue = Math.max(10, ...visual.series.flatMap((series) => series.values));
  const yMax = Math.ceil(maxValue / 10) * 10;
  const yTicks = Array.from({ length: 6 }, (_, index) => Math.round((yMax / 5) * index));
  const x = (index: number) => plot.left + (visual.categories.length === 1 ? plot.width / 2 : (index / (visual.categories.length - 1)) * plot.width);
  const y = (value: number) => plot.top + plot.height - (value / yMax) * plot.height;
  return (
    <svg aria-label={`${visual.title}. ${visual.subtitle || ""}`} className={chartClass} role="img" viewBox={`0 0 ${width} ${height}`}>
      <title>{visual.title}</title>
      <text className="chart-title" textAnchor="middle" x={width / 2} y="25">{visual.title}</text>
      {visual.subtitle ? <text className="chart-subtitle" textAnchor="middle" x={width / 2} y="44">{visual.subtitle}</text> : null}
      {yTicks.map((tick) => <g key={tick}><line className="chart-gridline" x1={plot.left} x2={plot.left + plot.width} y1={y(tick)} y2={y(tick)} /><text className="chart-axis-label" textAnchor="end" x={plot.left - 10} y={y(tick) + 4}>{tick}{visual.unit}</text></g>)}
      {visual.categories.map((category, index) => <text className="chart-axis-label" key={category} textAnchor="middle" x={x(index)} y={plot.top + plot.height + 24}>{category}</text>)}
      {visual.series.map((series, seriesIndex) => {
        const color = CHART_COLORS[seriesIndex % CHART_COLORS.length];
        if (visual.type === "bar") {
          const groupWidth = plot.width / visual.categories.length;
          const barWidth = Math.min(34, (groupWidth - 14) / visual.series.length);
          return <g key={series.name}>{series.values.map((value, index) => <rect fill={color} height={plot.top + plot.height - y(value)} key={`${series.name}-${index}`} rx="2" width={barWidth} x={plot.left + index * groupWidth + 7 + seriesIndex * barWidth} y={y(value)} />)}<g transform={`translate(${plot.left + seriesIndex * 165}, 330)`}><rect fill={color} height="10" width="24" y="-7" /><text className="chart-legend" x="32" y="4">{series.name}</text></g></g>;
        }
        const points = series.values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
        return <g key={series.name}><polyline fill="none" points={points} stroke={color} strokeLinejoin="round" strokeWidth="3" />{series.values.map((value, index) => <circle cx={x(index)} cy={y(value)} fill="#fff" key={`${series.name}-${index}`} r="4" stroke={color} strokeWidth="2.5" />)}<g transform={`translate(${plot.left + seriesIndex * 165}, 330)`}><line stroke={color} strokeWidth="3" x1="0" x2="24" y1="0" y2="0" /><text className="chart-legend" x="32" y="4">{series.name}</text></g></g>;
      })}
    </svg>
  );
}

export function TaskVisual({ visual }: { visual: WritingVisual }) {
  return (
    <figure className="task-visual">
      <TaskChart visual={visual} />
      <figcaption><span>{visual.sourceNote}</span><details><summary>查看大图</summary><div><TaskChart large visual={visual} /></div></details></figcaption>
    </figure>
  );
}

function AssessmentView({ assessment, essay, onBack }: { assessment: Assessment; essay: string; onBack: () => void }) {
  return (
    <div className="report-shell">
      <header className="report-header"><Link className="exam-brand" href="/"><span>A</span> AI–IELTS</Link><div><button className="button button-secondary" type="button" onClick={onBack}>返回修改</button></div></header>
      <main className="report-main">
        <section className="report-hero">
          <div><p className="eyebrow">AI WRITING ASSESSMENT</p><h1>这篇作文目前接近 Band {assessment.overallBand.toFixed(1)}</h1><p>{assessment.summary}</p></div>
          <div className="band-orb"><span>Overall</span><strong>{assessment.overallBand.toFixed(1)}</strong><small>{assessment.confidence} confidence</small></div>
        </section>
        <section className="criteria-grid">{assessment.criteria.map((criterion) => <article className="card criterion-card" key={criterion.name}><span>{criterion.name}</span><strong>{criterion.score.toFixed(1)}</strong><p>{criterion.rationale}</p></article>)}</section>
        <section className="report-grid">
          <article className="card report-card"><p className="eyebrow">STRENGTHS</p><h2>做得好的地方</h2>{assessment.strengths.length ? <ul>{assessment.strengths.map((strength) => <li key={strength}>{strength}</li>)}</ul> : <p>需要更多文本证据后判断。</p>}</article>
          <article className="card report-card"><p className="eyebrow">PRIORITY ISSUES</p><h2>优先修改</h2><ol>{assessment.issues.map((issue) => <li key={issue}>{issue}</li>)}</ol></article>
          <article className="card report-card"><p className="eyebrow">REWRITE</p><h2>下一轮重写任务</h2><ol>{assessment.rewritePrompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ol></article>
        </section>
        <section className="card annotations-card"><div className="section-title-row"><div><p className="eyebrow">SENTENCE REVIEW</p><h2>逐句问题</h2></div><span className="metric-chip">{assessment.sentenceAnnotations.length} 处</span></div>{assessment.sentenceAnnotations.map((item, index) => <div className="annotation" key={`${item.quote}-${index}`}><blockquote>{item.quote}</blockquote><div><span>{item.category}</span><p>{item.explanation}</p><strong>建议：{item.suggestion}</strong></div></div>)}</section>
        <section className="report-revisions">
          {assessment.suggestedRevision ? <details className="card essay-details"><summary>查看 AI 修改稿</summary><p>{assessment.suggestedRevision}</p></details> : null}
          {assessment.sampleAnswer ? <details className="card essay-details"><summary>查看参考范文</summary><p>{assessment.sampleAnswer}</p></details> : null}
        </section>
        <details className="card essay-details"><summary>查看本次提交原文</summary><p>{essay}</p></details>
        <p className="report-disclaimer">AI 评分仅用于训练反馈，不代表官方 IELTS 成绩。模型：{assessment.model}</p>
      </main>
    </div>
  );
}
