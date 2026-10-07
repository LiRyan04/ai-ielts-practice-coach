"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ExamRecord, PendingExercise, PracticeRecord, PracticeSkill } from "../../lib/practice/history";
import { waitForAiJob } from "../../lib/ai/job-client";

type Filter = "all" | PracticeSkill;

const skillLabels: Record<PracticeSkill, string> = { listening: "Listening", reading: "Reading", writing: "Writing" };
const filters: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "listening", label: "听力" },
  { key: "reading", label: "阅读" },
  { key: "writing", label: "写作" },
];

function formatDuration(seconds: number) {
  if (seconds < 60) return seconds > 0 ? `${seconds} 秒` : "未记录";
  return `${Math.floor(seconds / 60)} 分钟`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function statusLabel(record: PracticeRecord) {
  if (record.status === "assessed") return "AI 已评审";
  if (record.status === "draft") return "草稿";
  if (record.skill === "writing") return "等待 AI 评审";
  return "已完成";
}

function GenerationProgress({ item, deleting, onDelete }: { item: PendingExercise; deleting: boolean; onDelete: () => void }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (item.generationStatus === "failed") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [item.generationStatus]);

  if (item.generationStatus === "failed") {
    return <div className="generation-failed" role="alert"><strong>生成失败</strong><span>{item.generationError || "AI 没有生成完整可用的题目"}</span><div><Link href="/library/generate">重新生成</Link><button className="delete-button" disabled={deleting} onClick={onDelete} type="button">{deleting ? "删除中…" : "删除"}</button></div></div>;
  }

  const elapsedSeconds = Math.max(0, (now - new Date(item.createdAt).getTime()) / 1_000);
  const progress = item.generationStatus === "queued"
    ? Math.min(12, 5 + Math.floor(elapsedSeconds / 10))
    : Math.min(92, 18 + Math.floor(elapsedSeconds * 0.65));
  const label = item.generationStatus === "queued"
    ? "等待后台开始生成"
    : progress < 45 ? "正在构建题目内容" : progress < 75 ? "正在生成题目与答案" : "正在检查并保存题目";

  return (
    <div className="generation-progress" role="status" aria-live="polite">
      <div className="generation-progress-label"><span>{label}</span><strong>{progress}%</strong></div>
      <div className="generation-progress-track" aria-label={`生成进度 ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <small>进度为预计值，完成后会自动更新</small>
    </div>
  );
}

export function MyPracticeWorkspace({ exams, pending: initialPending, records: initialRecords }: { exams: ExamRecord[]; pending: PendingExercise[]; records: PracticeRecord[] }) {
  const [view, setView] = useState<"practice" | "exam">("practice");
  const [filter, setFilter] = useState<Filter>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "finished">("all");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState(initialPending);
  const [records, setRecords] = useState(initialRecords);
  const [deleting, setDeleting] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const filteredPending = useMemo(() => pending.filter((item) => filter === "all" || item.skill === filter), [filter, pending]);
  const filteredRecords = useMemo(() => records.filter((item) =>
    (filter === "all" || item.skill === filter)
    && (statusFilter === "all" || (statusFilter === "draft" ? item.status === "draft" : item.status !== "draft"))
    && `${item.title} ${item.collectionTitle}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  ), [filter, records, search, statusFilter]);
  const assessedCount = records.filter((record) => record.status === "assessed").length;
  const activeJobIds = useMemo(() => pending.filter((item) => item.generationStatus === "queued" || item.generationStatus === "running").map((item) => item.id).sort().join(","), [pending]);

  useEffect(() => {
    const jobIds = activeJobIds ? activeJobIds.split(",") : [];
    if (!jobIds.length) return;
    let active = true;
    for (const jobId of jobIds) {
      void waitForAiJob(jobId, (status) => {
        if (!active || (status !== "queued" && status !== "running")) return;
        setPending((current) => current.map((pendingItem) => pendingItem.id === jobId
          ? { ...pendingItem, generationStatus: status }
          : pendingItem));
      }).catch(() => null).finally(() => {
        if (active) window.location.reload();
      });
    }
    return () => { active = false; };
  }, [activeJobIds]);

  async function deleteItem(kind: "record" | "exercise" | "job", item: { id: string; skill: PracticeSkill; title: string }) {
    const noun = kind === "record" ? "练习记录及其答案、评审结果" : kind === "job" ? "失败任务记录" : "这道挂起题目";
    if (!window.confirm(`确定删除“${item.title}”的${noun}吗？此操作无法撤销。`)) return;
    const key = `${kind}-${item.skill}-${item.id}`;
    setDeleting(key);
    setDeleteError("");
    try {
      const response = await fetch(`/api/my-practice/items/${kind}/${item.skill}/${item.id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "删除失败");
      if (kind === "record") {
        setRecords((current) => current.filter((record) => record.id !== item.id || record.skill !== item.skill));
      }
      else setPending((current) => current.filter((exercise) => exercise.id !== item.id || exercise.skill !== item.skill));
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "删除失败");
    } finally { setDeleting(""); }
  }

  return (
    <>
      <header className="page-heading my-practice-heading">
        <div>
          <p className="eyebrow">MY PRACTICE</p>
          <h1>我的练习</h1>
        </div>
        <Link className="button button-primary" href="/library/generate">AI 生成新题 →</Link>
      </header>

      <nav className="practice-view-tabs" aria-label="记录类型">
        <button aria-current={view === "practice" ? "page" : undefined} className={view === "practice" ? "active" : ""} onClick={() => setView("practice")} type="button">练习与待练 <span>{records.length + pending.length}</span></button>
        <button aria-current={view === "exam" ? "page" : undefined} className={view === "exam" ? "active" : ""} onClick={() => setView("exam")} type="button">模拟考试 <span>{exams.length}</span></button>
      </nav>

      {view === "practice" ? <section className="practice-record-summary card" aria-label="练习记录汇总">
        <div><strong>{pending.length}</strong><span>待练习</span></div>
        <div><strong>{records.length}</strong><span>练习记录</span></div>
        <div><strong>{assessedCount}</strong><span>AI 写作评审</span></div>
        <div className="record-filter" role="group" aria-label="按科目筛选">
          {filters.map((item) => <button aria-pressed={filter === item.key} className={filter === item.key ? "active" : ""} key={item.key} onClick={() => setFilter(item.key)} type="button">{item.label}</button>)}
        </div>
      </section> : null}

      {deleteError ? <p className="practice-delete-error" role="alert">{deleteError}</p> : null}

      {view === "exam" ? <section className="home-section">
        <div className="section-title-row"><div><p className="eyebrow">MOCK EXAMS</p><h2>考试记录</h2></div><span className="section-note">共 {exams.length} 场</span></div>
        {exams.length ? <div className="exam-record-list">{exams.map((exam) => <article className="card exam-record-card" key={exam.id}>
          <div><span className="exam-record-badge">模拟考试</span><h3>{exam.title}</h3><p>{formatDate(exam.updatedAt)} 更新</p></div>
          <div className="exam-record-progress"><strong>{exam.completedSections}/{exam.totalSections}</strong><span>科目完成</span><i><b style={{ width: `${exam.completedSections / exam.totalSections * 100}%` }} /></i></div>
          <div className="exam-record-result"><strong>{exam.overallBand == null ? "—" : `Band ${exam.overallBand.toFixed(1)}`}</strong><span>{exam.status === "completed" ? "考试已完成" : "考试进行中"}</span></div>
          <Link href={exam.href}>{exam.status === "completed" ? "查看整套报告" : "继续考试"} →</Link>
        </article>)}</div> : <div className="card empty-practice-state"><strong>还没有考试记录</strong><p>从题库首页选择 Test 1–4 开始一次完整模拟考试。</p><Link href="/library">选择模拟考试 →</Link></div>}
      </section> : null}

      {view === "practice" ? <section className="home-section pending-practice-section">
        <div className="section-title-row">
          <div><p className="eyebrow">PENDING</p><h2>待练习</h2></div>
          <span className="section-note">AI 生成后自动挂起</span>
        </div>
        {filteredPending.length ? (
          <div className="pending-practice-grid">
            {filteredPending.map((item) => (
              <article className="card pending-practice-card" key={`${item.skill}-${item.id}`}>
                <div><span className={`skill-badge ${item.skill}`}>{skillLabels[item.skill]}</span><span className="ai-badge">{item.generationStatus === "failed" ? "生成失败" : item.generationStatus ? "生成中" : "AI 生成"}</span></div>
                <h3>{item.title}</h3>
                <p>{item.detail} · {formatDate(item.createdAt)} 创建</p>
                {item.generationStatus
                  ? <GenerationProgress item={item} deleting={deleting === `job-${item.skill}-${item.id}`} onDelete={() => void deleteItem("job", item)} />
                  : <div className="pending-card-actions"><Link className="button button-secondary" href={item.href}>开始练习 →</Link><button className="delete-button" disabled={deleting === `exercise-${item.skill}-${item.id}`} onClick={() => deleteItem("exercise", item)} type="button">{deleting === `exercise-${item.skill}-${item.id}` ? "删除中…" : "删除"}</button></div>}
              </article>
            ))}
          </div>
        ) : <div className="card empty-practice-state"><strong>当前没有待练题</strong><p>新生成的 AI 题目会自动出现在这里。</p><Link href="/library/generate">生成一道新题 →</Link></div>}
      </section> : null}

      {view === "practice" ? <section className="home-section">
        <div className="section-title-row">
          <div><p className="eyebrow">HISTORY</p><h2>练习记录</h2></div>
          <span className="section-note">共 {filteredRecords.length} 条</span>
        </div>
        <div className="practice-history-tools">
          <label><span>搜索题目</span><input aria-label="搜索练习记录" onChange={(event) => setSearch(event.target.value)} placeholder="搜索题目或题库" type="search" value={search} /></label>
          <div role="group" aria-label="按完成状态筛选">
            {([ ["all", "全部"], ["draft", "草稿"], ["finished", "已完成"] ] as const).map(([key, label]) => <button aria-pressed={statusFilter === key} className={statusFilter === key ? "active" : ""} key={key} onClick={() => setStatusFilter(key)} type="button">{label}</button>)}
          </div>
        </div>
        {filteredRecords.length ? <div className="practice-record-list">
          {filteredRecords.map((record) => (
            <details className="card practice-record-card" key={`${record.skill}-${record.id}`}>
              <summary>
                <span className={`skill-badge ${record.skill}`}>{skillLabels[record.skill]}</span>
                <span className="record-main"><strong>{record.title}</strong><small>{record.collectionTitle} · {formatDate(record.updatedAt)}</small></span>
                <span className={`record-status ${record.status}`}>{statusLabel(record)}</span>
                <span className="record-score">{record.scoreLabel || "—"}</span>
                <span className="record-chevron" aria-hidden="true">⌄</span>
              </summary>
              <div className="record-detail">
                <div className="record-meta-line">
                  <span>用时 {formatDuration(record.durationSeconds)}</span>
                  {record.generatedByAi ? <span className="ai-badge">AI 生成题</span> : null}
                  <Link href={record.href}>{record.status === "draft" ? "继续练习" : "再练一次"} →</Link>
                  <button className="delete-button" disabled={deleting === `record-${record.skill}-${record.id}`} onClick={() => deleteItem("record", record)} type="button">{deleting === `record-${record.skill}-${record.id}` ? "删除中…" : "删除记录"}</button>
                </div>
                {record.responseContent ? <div className="record-essay"><p className="eyebrow">YOUR ANSWER</p><p>{record.responseContent}</p></div> : null}
                {record.assessment ? <div className="record-assessment">
                  <div className="assessment-heading"><div><p className="eyebrow">AI ASSESSMENT</p><h3>Band {Number(record.assessment.overallBand || 0).toFixed(1)}</h3></div><span>{record.assessment.confidence ? `${record.assessment.confidence} confidence` : "已完成"}</span></div>
                  {record.assessment.summary ? <p className="assessment-summary">{record.assessment.summary}</p> : null}
                  {record.assessment.criteria?.length ? <div className="record-criteria">{record.assessment.criteria.map((criterion, index) => <div key={`${criterion.name}-${index}`}><strong>{criterion.name || `评分项 ${index + 1}`} · {criterion.score ?? "—"}</strong><p>{criterion.rationale}</p></div>)}</div> : null}
                  <div className="assessment-columns">
                    {record.assessment.strengths?.length ? <div><strong>做得好的地方</strong><ul>{record.assessment.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                    {record.assessment.issues?.length ? <div><strong>优先改进</strong><ul>{record.assessment.issues.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                  </div>
                  {record.assessment.suggestedRevision ? <details className="assessment-answer"><summary>查看 AI 修改稿</summary><p>{record.assessment.suggestedRevision}</p></details> : null}
                  {record.assessment.sampleAnswer ? <details className="assessment-answer"><summary>查看 AI 参考答案</summary><p>{record.assessment.sampleAnswer}</p></details> : null}
                  {record.assessments && record.assessments.length > 1 ? <div className="assessment-history">
                    <p className="eyebrow">PREVIOUS ASSESSMENTS · {record.assessments.length - 1}</p>
                    {record.assessments.slice(1).map((assessment) => <details className="assessment-history-item" key={assessment.id}>
                      <summary><span>Band {Number(assessment.overallBand || 0).toFixed(1)} · {formatDate(assessment.createdAt)}</span><small>{assessment.provider} · {assessment.model}</small></summary>
                      {assessment.summary ? <p>{assessment.summary}</p> : null}
                      {assessment.criteria?.length ? <div className="historical-criteria">{assessment.criteria.map((criterion, index) => <span key={`${criterion.name}-${index}`}><strong>{criterion.name || `评分项 ${index + 1}`}</strong> {criterion.score ?? "—"}</span>)}</div> : null}
                      {assessment.issues?.length ? <ul>{assessment.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : null}
                      {assessment.sampleAnswer ? <details className="assessment-answer"><summary>查看本次参考答案</summary><p>{assessment.sampleAnswer}</p></details> : null}
                    </details>)}
                  </div> : null}
                </div> : record.skill === "writing" && record.status === "submitted" ? <p className="assessment-pending">这篇作文已经提交，但还没有成功生成 AI 评审。可以重新练习并再次请求评审。</p> : null}
              </div>
            </details>
          ))}
        </div> : <div className="card empty-practice-state"><strong>没有符合条件的练习记录</strong><p>试试调整科目、状态或搜索词。</p><button className="button button-secondary" onClick={() => { setFilter("all"); setStatusFilter("all"); setSearch(""); }} type="button">清除筛选</button></div>}
      </section> : null}
    </>
  );
}
