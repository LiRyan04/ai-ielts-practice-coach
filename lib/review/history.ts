import { ensureDatabase, getD1 } from "../../db";

export type ReviewSkill = "listening" | "reading";

export type WrongAnswer = {
  questionNumber: number;
  answer: string;
  correctAnswer: string;
};

export type DiagnosisItem = {
  questionNumber: number;
  errorType: string;
  analysis: string;
  evidence: string;
  paraphrases: Array<{ source: string; replacement: string }>;
  nextAction: string;
};

export type PracticeDiagnosis = {
  id: string;
  summary: string;
  patterns: string[];
  items: DiagnosisItem[];
  provider: string;
  model: string;
  createdAt: string;
};

export type ObjectiveReviewAttempt = {
  id: string;
  skill: ReviewSkill;
  title: string;
  collectionTitle: string;
  bandScore: number;
  correctCount: number;
  scoredCount: number;
  submittedAt: string;
  href: string;
  wrongAnswers: WrongAnswer[];
  diagnosis?: PracticeDiagnosis;
};

export type WritingReview = {
  id: string;
  title: string;
  bandScore: number;
  submittedAt: string;
  href: string;
  issues: string[];
  annotations: Array<{ quote: string; category: string; explanation: string; suggestion: string }>;
};

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

function wrongAnswers(value: unknown): WrongAnswer[] {
  const details = parseObject(value)?.details;
  if (!Array.isArray(details)) return [];
  return details.filter((item) => item && typeof item === "object" && (item as Record<string, unknown>).correct === false).map((item) => {
    const row = item as Record<string, unknown>;
    return { questionNumber: Number(row.questionNumber), answer: String(row.answer || "未作答"), correctAnswer: String(row.correctAnswer || "") };
  });
}

function parseDiagnosis(row: Record<string, unknown>): PracticeDiagnosis | undefined {
  const result = parseObject(row.diagnosis_json);
  if (!result) return undefined;
  return {
    id: String(row.diagnosis_id),
    summary: String(result.summary || "已完成错题诊断。"),
    patterns: Array.isArray(result.patterns) ? result.patterns.map(String).slice(0, 6) : [],
    items: Array.isArray(result.items) ? result.items.map((value) => {
      const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
      return {
        questionNumber: Number(item.questionNumber), errorType: String(item.errorType || "信息定位"),
        analysis: String(item.analysis || "需要重新定位题干与原文的对应关系。"), evidence: String(item.evidence || "未能从材料中定位可靠证据。"),
        paraphrases: Array.isArray(item.paraphrases) ? item.paraphrases.map((pair) => {
          const raw = pair && typeof pair === "object" ? pair as Record<string, unknown> : {};
          return { source: String(raw.source || ""), replacement: String(raw.replacement || "") };
        }).filter((pair) => pair.source || pair.replacement).slice(0, 5) : [],
        nextAction: String(item.nextAction || "重做本题并标出定位词。"),
      };
    }).filter((item) => Number.isFinite(item.questionNumber)) : [],
    provider: String(row.diagnosis_provider), model: String(row.diagnosis_model), createdAt: String(row.diagnosis_created_at),
  };
}

export async function getReviewData(accountId: string): Promise<{ attempts: ObjectiveReviewAttempt[]; writing: WritingReview[] }> {
  await ensureDatabase();
  const database = getD1();
  const [listening, reading, writing] = await Promise.all([
    database.prepare(`SELECT a.id, a.paper_id, a.band_score, a.correct_count, a.scored_count, a.result_json, a.submitted_at,
      p.title, p.collection_title, d.id AS diagnosis_id, d.provider AS diagnosis_provider, d.model AS diagnosis_model,
      d.result_json AS diagnosis_json, d.created_at AS diagnosis_created_at
      FROM listening_attempts a JOIN listening_papers p ON p.id = a.paper_id
      LEFT JOIN practice_diagnoses d ON d.id = (SELECT x.id FROM practice_diagnoses x WHERE x.attempt_id = a.id AND x.account_id = ? ORDER BY x.created_at DESC LIMIT 1)
      WHERE a.account_id = ? AND a.status = 'submitted' AND a.exam_session_id IS NULL ORDER BY a.submitted_at DESC LIMIT 100`).bind(accountId, accountId).all<Record<string, unknown>>(),
    database.prepare(`SELECT a.id, a.paper_id, a.band_score, a.correct_count, a.scored_count, a.result_json, a.submitted_at,
      p.title, p.collection_title, d.id AS diagnosis_id, d.provider AS diagnosis_provider, d.model AS diagnosis_model,
      d.result_json AS diagnosis_json, d.created_at AS diagnosis_created_at
      FROM reading_attempts a JOIN reading_papers p ON p.id = a.paper_id
      LEFT JOIN practice_diagnoses d ON d.id = (SELECT x.id FROM practice_diagnoses x WHERE x.attempt_id = a.id AND x.account_id = ? ORDER BY x.created_at DESC LIMIT 1)
      WHERE a.account_id = ? AND a.status = 'submitted' AND a.exam_session_id IS NULL ORDER BY a.submitted_at DESC LIMIT 100`).bind(accountId, accountId).all<Record<string, unknown>>(),
    database.prepare(`SELECT a.id, a.prompt_id, a.submitted_at, COALESCE(p.title, a.task_type) AS title, aa.overall_band, aa.result_json
      FROM attempts a LEFT JOIN writing_prompts p ON p.id = a.prompt_id
      JOIN ai_assessments aa ON aa.id = (SELECT x.id FROM ai_assessments x WHERE x.attempt_id = a.id ORDER BY x.created_at DESC LIMIT 1)
      WHERE a.account_id = ? AND a.skill = 'writing' AND a.status = 'submitted' AND a.exam_session_id IS NULL ORDER BY a.submitted_at DESC LIMIT 100`).bind(accountId).all<Record<string, unknown>>(),
  ]);
  const mapAttempt = (skill: ReviewSkill, row: Record<string, unknown>): ObjectiveReviewAttempt => ({
    id: String(row.id), skill, title: String(row.title), collectionTitle: String(row.collection_title), bandScore: Number(row.band_score),
    correctCount: Number(row.correct_count), scoredCount: Number(row.scored_count), submittedAt: String(row.submitted_at),
    href: `/practice/${skill}/${row.paper_id}`, wrongAnswers: wrongAnswers(row.result_json), diagnosis: parseDiagnosis(row),
  });
  return {
    attempts: [...listening.results.map((row) => mapAttempt("listening", row)), ...reading.results.map((row) => mapAttempt("reading", row))]
      .filter((attempt) => attempt.wrongAnswers.length).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    writing: writing.results.map((row) => {
      const assessment = parseObject(row.result_json) || {};
      return {
        id: String(row.id), title: String(row.title), bandScore: Number(row.overall_band), submittedAt: String(row.submitted_at),
        href: row.prompt_id && row.prompt_id !== "custom-prompt" ? `/practice/writing/${row.prompt_id}` : "/practice/writing",
        issues: Array.isArray(assessment.issues) ? assessment.issues.map(String).slice(0, 8) : [],
        annotations: Array.isArray(assessment.sentenceAnnotations) ? assessment.sentenceAnnotations.slice(0, 12) as WritingReview["annotations"] : [],
      };
    }),
  };
}
