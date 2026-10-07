import { ensureDatabase, getD1 } from "../../db";
import type { PracticeSummary, PracticeSummaryRecord } from "../ai/practice-summary";

export type PracticeSkill = "listening" | "reading" | "writing";

export type WritingAssessment = {
  overallBand?: number;
  confidence?: string;
  summary?: string;
  strengths?: string[];
  issues?: string[];
  criteria?: Array<{ name?: string; score?: number; rationale?: string }>;
  suggestedRevision?: string;
  sampleAnswer?: string;
};

export type WritingAssessmentEntry = WritingAssessment & {
  id: string;
  provider: string;
  model: string;
  createdAt: string;
};

export type PracticeRecord = {
  id: string;
  skill: PracticeSkill;
  title: string;
  collectionTitle: string;
  status: "draft" | "submitted" | "assessed";
  durationSeconds: number;
  scoreLabel: string | null;
  updatedAt: string;
  href: string;
  generatedByAi: boolean;
  responseContent?: string;
  assessment?: WritingAssessment;
  assessments?: WritingAssessmentEntry[];
};

export type PendingExercise = {
  id: string;
  skill: PracticeSkill;
  title: string;
  detail: string;
  createdAt: string;
  href: string;
  generationStatus?: "queued" | "running" | "failed";
  generationError?: string;
};

export type ExamRecord = {
  id: string;
  title: string;
  status: "in_progress" | "completed";
  completedSections: number;
  totalSections: number;
  updatedAt: string;
  href: string;
  overallBand: number | null;
};

function parsePracticeSummary(value: unknown): PracticeSummary | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as PracticeSummary : undefined;
  } catch { return undefined; }
}

function parseAssessment(value: unknown): WritingAssessment | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as WritingAssessment : undefined;
  } catch {
    return undefined;
  }
}

function parseJobPayload(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

export async function getMyPractice(accountId: string): Promise<{ pending: PendingExercise[]; records: PracticeRecord[]; exams: ExamRecord[]; summary?: PracticeSummaryRecord }> {
  await ensureDatabase();
  const database = getD1();
  const [writing, reading, listening, writingAssessments, pendingWriting, pendingReading, pendingListening, generationJobs, latestSummary] = await Promise.all([
    database.prepare(`
      SELECT a.id, a.prompt_id, a.status, a.duration_seconds, a.updated_at,
        COALESCE(wp.title, CASE WHEN a.task_type = 'task1' THEN 'Academic Writing Task 1' ELSE 'Academic Writing Task 2' END) AS title,
        wp.source, r.content, aa.overall_band, aa.result_json
      FROM attempts a
      LEFT JOIN writing_prompts wp ON wp.id = a.prompt_id
      LEFT JOIN responses r ON r.attempt_id = a.id
      LEFT JOIN ai_assessments aa ON aa.id = (
        SELECT latest.id FROM ai_assessments latest WHERE latest.attempt_id = a.id ORDER BY latest.created_at DESC LIMIT 1
      )
      WHERE a.account_id = ? AND a.skill = 'writing' AND a.exam_session_id IS NULL
      ORDER BY a.updated_at DESC LIMIT 100
    `).bind(accountId).all<Record<string, unknown>>(),
    database.prepare(`
      SELECT a.id, a.paper_id, a.status, a.duration_seconds, a.band_score, COALESCE(a.updated_at, a.submitted_at) AS updated_at,
        p.title, p.collection_title, p.owner_account_id
      FROM reading_attempts a JOIN reading_papers p ON p.id = a.paper_id
      WHERE a.account_id = ? AND a.exam_session_id IS NULL ORDER BY COALESCE(a.updated_at, a.submitted_at) DESC LIMIT 100
    `).bind(accountId).all<Record<string, unknown>>(),
    database.prepare(`
      SELECT a.id, a.paper_id, a.status, a.duration_seconds, a.band_score, COALESCE(a.updated_at, a.submitted_at) AS updated_at,
        p.title, p.collection_title, p.owner_account_id
      FROM listening_attempts a JOIN listening_papers p ON p.id = a.paper_id
      WHERE a.account_id = ? AND a.exam_session_id IS NULL ORDER BY COALESCE(a.updated_at, a.submitted_at) DESC LIMIT 100
    `).bind(accountId).all<Record<string, unknown>>(),
    database.prepare(`
      SELECT aa.id, aa.attempt_id, aa.provider, aa.model, aa.result_json, aa.created_at
      FROM ai_assessments aa JOIN attempts a ON a.id = aa.attempt_id
      WHERE a.account_id = ? AND a.exam_session_id IS NULL ORDER BY aa.created_at DESC
    `).bind(accountId).all<Record<string, unknown>>(),
    database.prepare(`
      SELECT p.id, p.title, p.task_type, p.created_at
      FROM writing_prompts p
      WHERE p.account_id = ? AND NOT EXISTS (
        SELECT 1 FROM attempts a WHERE a.account_id = ? AND a.prompt_id = p.id AND a.exam_session_id IS NULL
      ) ORDER BY p.created_at DESC
    `).bind(accountId, accountId).all<Record<string, unknown>>(),
    database.prepare(`
      SELECT p.id, p.title, p.question_count, p.created_at
      FROM reading_papers p
      WHERE p.owner_account_id = ? AND NOT EXISTS (
        SELECT 1 FROM reading_attempts a WHERE a.account_id = ? AND a.paper_id = p.id AND a.exam_session_id IS NULL
      ) ORDER BY p.created_at DESC
    `).bind(accountId, accountId).all<Record<string, unknown>>(),
    database.prepare(`
      SELECT p.id, p.title, p.question_count, p.created_at
      FROM listening_papers p
      WHERE p.owner_account_id = ? AND NOT EXISTS (
        SELECT 1 FROM listening_attempts a WHERE a.account_id = ? AND a.paper_id = p.id AND a.exam_session_id IS NULL
      ) ORDER BY p.created_at DESC
    `).bind(accountId, accountId).all<Record<string, unknown>>(),
    database.prepare(`
      SELECT id, status, payload_json, error, created_at
      FROM ai_jobs
      WHERE account_id = ? AND type = 'generate_exercise' AND status IN ('queued', 'running', 'failed')
      ORDER BY created_at DESC
    `).bind(accountId).all<Record<string, unknown>>(),
    database.prepare(`SELECT id, provider, model, result_json, record_count, created_at
      FROM practice_summaries WHERE account_id = ? ORDER BY created_at DESC LIMIT 1`)
      .bind(accountId).first<Record<string, unknown>>(),
  ]);

  const assessmentsByAttempt = new Map<string, WritingAssessmentEntry[]>();
  for (const row of writingAssessments.results) {
    const parsed = parseAssessment(row.result_json);
    if (!parsed) continue;
    const attemptId = String(row.attempt_id);
    const entries = assessmentsByAttempt.get(attemptId) || [];
    entries.push({ ...parsed, id: String(row.id), provider: String(row.provider), model: String(row.model), createdAt: String(row.created_at) });
    assessmentsByAttempt.set(attemptId, entries);
  }

  const records: PracticeRecord[] = [
    ...writing.results.map((row) => {
      const assessment = parseAssessment(row.result_json);
      return {
        id: String(row.id),
        skill: "writing" as const,
        title: String(row.title),
        collectionTitle: row.source ? "AI 私人题库" : "Writing Practice",
        status: assessment ? "assessed" as const : row.status === "submitted" ? "submitted" as const : "draft" as const,
        durationSeconds: Number(row.duration_seconds) || 0,
        scoreLabel: assessment?.overallBand != null ? `Band ${Number(assessment.overallBand).toFixed(1)}` : null,
        updatedAt: String(row.updated_at),
        href: row.prompt_id && row.prompt_id !== "custom-prompt" ? `/practice/writing/${row.prompt_id}` : "/practice/writing",
        generatedByAi: Boolean(row.source),
        responseContent: typeof row.content === "string" ? row.content : undefined,
        assessment,
        assessments: assessmentsByAttempt.get(String(row.id)) || [],
      };
    }),
    ...reading.results.map((row) => ({
      id: String(row.id),
      skill: "reading" as const,
      title: String(row.title),
      collectionTitle: String(row.collection_title),
      status: row.status === "draft" ? "draft" as const : "submitted" as const,
      durationSeconds: Number(row.duration_seconds) || 0,
      scoreLabel: row.status === "draft" ? null : `Band ${Number(row.band_score).toFixed(1)}`,
      updatedAt: String(row.updated_at),
      href: `/practice/reading/${row.paper_id}`,
      generatedByAi: Boolean(row.owner_account_id),
    })),
    ...listening.results.map((row) => ({
      id: String(row.id),
      skill: "listening" as const,
      title: String(row.title),
      collectionTitle: String(row.collection_title),
      status: row.status === "draft" ? "draft" as const : "submitted" as const,
      durationSeconds: Number(row.duration_seconds) || 0,
      scoreLabel: row.status === "draft" ? null : `Band ${Number(row.band_score).toFixed(1)}`,
      updatedAt: String(row.updated_at),
      href: `/practice/listening/${row.paper_id}`,
      generatedByAi: Boolean(row.owner_account_id),
    })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const pending: PendingExercise[] = [
    ...generationJobs.results.flatMap((row) => {
      const payload = parseJobPayload(row.payload_json);
      const skill = payload.skill;
      if (skill !== "listening" && skill !== "reading" && skill !== "writing") return [];
      const topic = typeof payload.topic === "string" && payload.topic.trim() ? payload.topic.trim() : "IELTS 常见主题";
      const status = row.status === "failed" ? "failed" as const : row.status === "running" ? "running" as const : "queued" as const;
      return [{
        id: String(row.id),
        skill: skill as PracticeSkill,
        title: `正在生成：${topic}`,
        detail: status === "failed" ? "生成失败，任务记录已保留" : status === "queued" ? "等待后台开始生成" : "AI 正在生成并检查答案",
        createdAt: String(row.created_at),
        href: "",
        generationStatus: status,
        generationError: status === "failed" && typeof row.error === "string" ? row.error : undefined,
      }];
    }),
    ...pendingWriting.results.map((row) => ({ id: String(row.id), skill: "writing" as const, title: String(row.title), detail: row.task_type === "task1" ? "Academic Task 1" : "Academic Task 2", createdAt: String(row.created_at), href: `/practice/writing/${row.id}` })),
    ...pendingReading.results.map((row) => ({ id: String(row.id), skill: "reading" as const, title: String(row.title), detail: `${Number(row.question_count) || 0} 道题`, createdAt: String(row.created_at), href: `/practice/reading/${row.id}` })),
    ...pendingListening.results.map((row) => ({ id: String(row.id), skill: "listening" as const, title: String(row.title), detail: `${Number(row.question_count) || 0} 道题 · 支持 TTS`, createdAt: String(row.created_at), href: `/practice/listening/${row.id}` })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const parsedSummary = parsePracticeSummary(latestSummary?.result_json);
  const summary = latestSummary && parsedSummary ? {
    ...parsedSummary,
    id: String(latestSummary.id),
    provider: String(latestSummary.provider),
    model: String(latestSummary.model),
    recordCount: Number(latestSummary.record_count) || 0,
    createdAt: String(latestSummary.created_at),
  } : undefined;

  const examRows = await database.prepare(`SELECT id, collection_id, test_number, status, progress_json, report_json, updated_at FROM exam_sessions WHERE account_id = ? ORDER BY updated_at DESC LIMIT 50`).bind(accountId).all<Record<string, unknown>>();
  const exams: ExamRecord[] = examRows.results.map((row) => {
    let progress: Record<string, { status?: string }> = {};
    let report: { overallBand?: number | null } = {};
    try { progress = JSON.parse(String(row.progress_json || "{}")); } catch {}
    try { report = JSON.parse(String(row.report_json || "{}")); } catch {}
    return {
      id: String(row.id),
      title: `IELTS Academic ${row.collection_id} · Test ${row.test_number}`,
      status: row.status === "completed" ? "completed" : "in_progress",
      completedSections: ["listening", "reading", "writing"].filter((skill) => progress[skill]?.status === "completed").length,
      totalSections: 3,
      updatedAt: String(row.updated_at),
      href: `/mock/${row.collection_id}/${row.test_number}?sessionId=${encodeURIComponent(String(row.id))}`,
      overallBand: typeof report.overallBand === "number" ? report.overallBand : null,
    };
  });
  return { pending, records, exams, summary };
}
