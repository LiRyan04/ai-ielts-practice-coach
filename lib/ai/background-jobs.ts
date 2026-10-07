import { ensureDatabase, getD1 } from "../../db";
import { getAccountAiConfiguration } from "../account";
import { generateExercise, type ExerciseDifficulty, type ExerciseSkill } from "./generate-exercise";
import { summarizePractice, type PracticeEvidence } from "./practice-summary";
import { saveGeneratedListeningPaper } from "../listening/library";
import { saveGeneratedReadingPaper } from "../reading/library";
import { saveGeneratedWritingPrompt } from "../writing/library";

export type AiJobType = "generate_exercise" | "practice_summary";
export type AiJobStatus = "queued" | "running" | "completed" | "failed";

type AiJobRow = {
  id: string;
  accountId: string;
  type: AiJobType;
  status: AiJobStatus;
  payloadJson: string;
  resultJson: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type PublicAiJob = {
  id: string;
  type: AiJobType;
  status: AiJobStatus;
  result: unknown;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

function parseObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function publicJob(row: AiJobRow): PublicAiJob {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    result: row.resultJson ? parseObject(row.resultJson) : null,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
  };
}

export async function createAiJob(accountId: string, type: AiJobType, payload: Record<string, unknown>) {
  await ensureDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await getD1().prepare(`INSERT INTO ai_jobs
    (id, account_id, type, status, payload_json, result_json, error, attempts, created_at, updated_at)
    VALUES (?, ?, ?, 'queued', ?, NULL, NULL, 0, ?, ?)`)
    .bind(id, accountId, type, JSON.stringify(payload), now, now).run();
  return { id, type, status: "queued" as const, createdAt: now };
}

export async function getAiJobForAccount(id: string, accountId: string) {
  await ensureDatabase();
  const row = await getD1().prepare(`SELECT id, account_id AS accountId, type, status, payload_json AS payloadJson,
    result_json AS resultJson, error, attempts, created_at AS createdAt, updated_at AS updatedAt,
    started_at AS startedAt, completed_at AS completedAt FROM ai_jobs WHERE id = ? AND account_id = ?`)
    .bind(id, accountId).first<AiJobRow>();
  return row ? publicJob(row) : null;
}

async function loadJob(id: string) {
  return getD1().prepare(`SELECT id, account_id AS accountId, type, status, payload_json AS payloadJson,
    result_json AS resultJson, error, attempts, created_at AS createdAt, updated_at AS updatedAt,
    started_at AS startedAt, completed_at AS completedAt FROM ai_jobs WHERE id = ?`)
    .bind(id).first<AiJobRow>();
}

async function runExerciseJob(accountId: string, payload: Record<string, unknown>) {
  const configuration = await getAccountAiConfiguration(accountId);
  if (!configuration) throw new Error("文本模型或 API Key 尚未配置");
  const skill = payload.skill as ExerciseSkill;
  const difficulty = payload.difficulty as ExerciseDifficulty;
  const topic = typeof payload.topic === "string" ? payload.topic : "";
  const questionCount = Number(payload.questionCount);
  const writingTask = payload.writingTask === "task1" || payload.writingTask === "both" ? payload.writingTask : "task2";
  const generated = await generateExercise({ skill, difficulty, topic, questionCount, writingTask }, configuration);
  const source = `ai:${configuration.provider}:${configuration.model}`;
  let id: string;
  let href: string;
  if (generated.skill === "reading") {
    id = await saveGeneratedReadingPaper(accountId, { ...generated, difficulty, sourceReference: source });
    href = `/practice/reading/${id}`;
  } else if (generated.skill === "listening") {
    id = await saveGeneratedListeningPaper(accountId, { ...generated, sourceReference: source });
    href = `/practice/listening/${id}`;
  } else {
    const saved = [];
    for (const prompt of generated.prompts) {
      const promptId = await saveGeneratedWritingPrompt(accountId, { ...prompt, source });
      saved.push({ id: promptId, href: `/practice/writing/${promptId}`, skill: generated.skill, title: prompt.title, taskType: prompt.taskType });
    }
    return { exercise: saved[0], exercises: saved };
  }
  return { exercise: { id, href, skill: generated.skill, title: generated.title } };
}

function wrongAnswers(value: unknown) {
  const details = parseObject(typeof value === "string" ? value : null).details;
  if (!Array.isArray(details)) return [];
  return details.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).correct === false).map((item) => {
    const row = item as Record<string, unknown>;
    return { question: Number(row.questionNumber), answer: String(row.answer || "未作答").slice(0, 120), correctAnswer: String(row.correctAnswer || "").slice(0, 120) };
  }).slice(0, 40);
}

async function runSummaryJob(accountId: string) {
  const configuration = await getAccountAiConfiguration(accountId);
  if (!configuration) throw new Error("文本模型或 API Key 尚未配置");
  const database = getD1();
  const [listening, reading, writing, learning, profile] = await Promise.all([
    database.prepare(`SELECT p.title, a.duration_seconds, a.correct_count, a.scored_count, a.band_score, a.result_json, a.submitted_at
      FROM listening_attempts a JOIN listening_papers p ON p.id = a.paper_id
      WHERE a.account_id = ? AND a.status = 'submitted' AND a.exam_session_id IS NULL ORDER BY a.submitted_at`).bind(accountId).all<Record<string, unknown>>(),
    database.prepare(`SELECT p.title, a.duration_seconds, a.correct_count, a.scored_count, a.band_score, a.result_json, a.submitted_at
      FROM reading_attempts a JOIN reading_papers p ON p.id = a.paper_id
      WHERE a.account_id = ? AND a.status = 'submitted' AND a.exam_session_id IS NULL ORDER BY a.submitted_at`).bind(accountId).all<Record<string, unknown>>(),
    database.prepare(`SELECT COALESCE(p.title, a.task_type) AS title, a.task_type, a.duration_seconds, a.submitted_at,
        r.word_count, r.content, aa.result_json
      FROM attempts a LEFT JOIN writing_prompts p ON p.id = a.prompt_id LEFT JOIN responses r ON r.attempt_id = a.id
      LEFT JOIN ai_assessments aa ON aa.id = (SELECT x.id FROM ai_assessments x WHERE x.attempt_id = a.id ORDER BY x.created_at DESC LIMIT 1)
      WHERE a.account_id = ? AND a.skill = 'writing' AND a.status = 'submitted' AND a.exam_session_id IS NULL ORDER BY a.submitted_at`).bind(accountId).all<Record<string, unknown>>(),
    database.prepare(`SELECT COALESCE(SUM(active_seconds), 0) AS total_seconds,
        COALESCE(SUM(CASE WHEN local_date >= date('now', '-6 days') THEN active_seconds ELSE 0 END), 0) AS recent_seconds,
        COALESCE(SUM(completed_exercises), 0) AS completed_exercises FROM learning_daily_stats WHERE account_id = ?`).bind(accountId).first<Record<string, unknown>>(),
    database.prepare("SELECT target_band, current_band FROM learner_profiles WHERE id = ?").bind(accountId).first<Record<string, unknown>>(),
  ]);
  const recordCount = listening.results.length + reading.results.length + writing.results.length;
  if (!recordCount) throw new Error("至少完成一次练习后才能生成 AI 学习总结");
  const objectiveAttempts = (skill: "listening" | "reading", rows: Record<string, unknown>[]) => rows.map((row) => ({
    skill, title: String(row.title), date: String(row.submitted_at), durationMinutes: Math.round(Number(row.duration_seconds) / 60),
    correct: Number(row.correct_count), total: Number(row.scored_count), band: Number(row.band_score), wrongAnswers: wrongAnswers(row.result_json),
  }));
  const evidence: PracticeEvidence = {
    profile: { targetBand: Number(profile?.target_band ?? 7), currentBand: Number(profile?.current_band ?? 5.5) },
    learning: {
      totalMinutes: Math.round(Number(learning?.total_seconds ?? 0) / 60),
      recentMinutes: Math.round(Number(learning?.recent_seconds ?? 0) / 60),
      completedExercises: Number(learning?.completed_exercises ?? 0),
    },
    totals: { listening: listening.results.length, reading: reading.results.length, writing: writing.results.length },
    attempts: [
      ...objectiveAttempts("listening", listening.results),
      ...objectiveAttempts("reading", reading.results),
      ...writing.results.map((row) => {
        const assessment = parseObject(typeof row.result_json === "string" ? row.result_json : null);
        return {
          skill: "writing", title: String(row.title), taskType: String(row.task_type), date: String(row.submitted_at),
          durationMinutes: Math.round(Number(row.duration_seconds) / 60), wordCount: Number(row.word_count || 0),
          essayExcerpt: String(row.content || "").slice(0, 1_500),
          assessment: row.result_json ? {
            overallBand: assessment.overallBand, confidence: assessment.confidence, criteria: assessment.criteria,
            strengths: assessment.strengths, issues: assessment.issues, summary: assessment.summary,
          } : null,
        };
      }),
    ],
  };
  const summary = await summarizePractice(evidence, configuration);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await database.prepare("INSERT INTO practice_summaries (id, account_id, provider, model, result_json, record_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, accountId, configuration.provider, configuration.model, JSON.stringify(summary), recordCount, createdAt).run();
  return { summary: { ...summary, id, provider: configuration.provider, model: configuration.model, recordCount, createdAt } };
}

export async function processAiJob(id: string) {
  await ensureDatabase();
  const database = getD1();
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const claim = await database.prepare(`UPDATE ai_jobs SET status = 'running', attempts = attempts + 1,
    started_at = COALESCE(started_at, ?), updated_at = ?, error = NULL
    WHERE id = ? AND (status = 'queued' OR (status = 'running' AND updated_at < ?))`)
    .bind(now, now, id, staleBefore).run();
  if (!claim.meta.changes) return;
  const job = await loadJob(id);
  if (!job) return;
  try {
    const payload = parseObject(job.payloadJson);
    const result = job.type === "generate_exercise"
      ? await runExerciseJob(job.accountId, payload)
      : await runSummaryJob(job.accountId);
    const completedAt = new Date().toISOString();
    await database.prepare("UPDATE ai_jobs SET status = 'completed', result_json = ?, error = NULL, updated_at = ?, completed_at = ? WHERE id = ?")
      .bind(JSON.stringify(result), completedAt, completedAt, id).run();
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : "后台生成失败";
    await database.prepare("UPDATE ai_jobs SET status = 'failed', error = ?, updated_at = ?, completed_at = ? WHERE id = ?")
      .bind(message.slice(0, 1_000), failedAt, failedAt, id).run();
  }
}
