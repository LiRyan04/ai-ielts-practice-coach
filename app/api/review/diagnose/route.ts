import { NextResponse } from "next/server";
import { ensureDatabase, getD1 } from "../../../../db";
import { getAccountAiConfiguration, requireRequestAccount } from "../../../../lib/account";
import { diagnoseMistakes } from "../../../../lib/ai/diagnose-mistakes";
import { AiConfigurationError } from "../../../../lib/ai/qwen";
import type { ReviewSkill } from "../../../../lib/review/history";

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

function questionMap(rows: Record<string, unknown>[]) {
  const map = new Map<number, { prompt: string; options: string[] }>();
  for (const row of rows) {
    const questions = parseObject(`{"items":${row.questions_json || "[]"}}`).items;
    if (!Array.isArray(questions)) continue;
    for (const value of questions) {
      if (!value || typeof value !== "object") continue;
      const question = value as Record<string, unknown>;
      const number = Number(question.number);
      if (!Number.isFinite(number)) continue;
      map.set(number, { prompt: String(question.prompt || ""), options: Array.isArray(question.options) ? question.options.map(String).slice(0, 10) : [] });
    }
  }
  return map;
}

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    const attemptId = typeof input.attemptId === "string" ? input.attemptId : "";
    const skill: ReviewSkill | null = input.skill === "listening" || input.skill === "reading" ? input.skill : null;
    if (!attemptId || !skill) return NextResponse.json({ error: "缺少待诊断的练习记录" }, { status: 400 });
    await ensureDatabase();
    const database = getD1();
    const attempt = await database.prepare(`SELECT a.id, a.paper_id, a.result_json, p.title FROM ${skill}_attempts a
      JOIN ${skill}_papers p ON p.id = a.paper_id WHERE a.id = ? AND a.account_id = ? AND a.status = 'submitted' AND a.exam_session_id IS NULL`)
      .bind(attemptId, account.id).first<Record<string, unknown>>();
    if (!attempt) return NextResponse.json({ error: "未找到这次练习" }, { status: 404 });
    const childTable = skill === "reading" ? "reading_passages" : "listening_sections";
    const sourceColumn = skill === "reading" ? "article" : "transcript";
    const sourceRows = await database.prepare(`SELECT ${sourceColumn} AS source_text, questions_json FROM ${childTable} WHERE paper_id = ? ORDER BY ${skill === "reading" ? "passage_number" : "section_number"}`)
      .bind(String(attempt.paper_id)).all<Record<string, unknown>>();
    const result = parseObject(attempt.result_json);
    const details = Array.isArray(result.details) ? result.details : [];
    const metadata = questionMap(sourceRows.results);
    const questions = details.filter((value) => value && typeof value === "object" && (value as Record<string, unknown>).correct === false).map((value) => {
      const row = value as Record<string, unknown>;
      const number = Number(row.questionNumber);
      const meta = metadata.get(number);
      return { questionNumber: number, prompt: meta?.prompt || "", options: meta?.options || [], answer: String(row.answer || "未作答"), correctAnswer: String(row.correctAnswer || "") };
    }).filter((question) => Number.isFinite(question.questionNumber));
    if (!questions.length) return NextResponse.json({ error: "这次练习没有可诊断的错题" }, { status: 400 });
    const configuration = await getAccountAiConfiguration(account.id);
    if (!configuration) throw new AiConfigurationError("请先在设置中配置文本 AI Provider 和 API Key");
    const diagnosis = await diagnoseMistakes({
      skill, title: String(attempt.title), questions,
      sourceMaterial: sourceRows.results.map((row) => String(row.source_text || "")).join("\n\n").slice(0, 12_000),
    }, configuration);
    const record = { id: crypto.randomUUID(), provider: configuration.provider, model: configuration.model, createdAt: new Date().toISOString() };
    await database.prepare("INSERT INTO practice_diagnoses (id, account_id, attempt_id, skill, provider, model, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(record.id, account.id, attemptId, skill, record.provider, record.model, JSON.stringify(diagnosis), record.createdAt).run();
    return NextResponse.json({ diagnosis: { ...diagnosis, ...record } }, { status: 201 });
  } catch (error) {
    if (error instanceof AiConfigurationError) return NextResponse.json({ error: error.message, code: "AI_NOT_CONFIGURED" }, { status: 503 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "错题诊断失败" }, { status: 500 });
  }
}
