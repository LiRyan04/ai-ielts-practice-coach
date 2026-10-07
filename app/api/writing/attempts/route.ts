import { NextResponse } from "next/server";
import { ensureDatabase, getD1 } from "../../../../db";
import { countWords } from "../../../../lib/writing/rules";
import { requireRequestAccount } from "../../../../lib/account";
import { recordExerciseCompletion } from "../../../../lib/learning/stats";

type AttemptInput = {
  promptId?: unknown;
  taskType?: unknown;
  content?: unknown;
  wordCount?: unknown;
  durationSeconds?: unknown;
  status?: unknown;
  localDate?: unknown;
  examSessionId?: unknown;
};

function parseAttemptInput(value: AttemptInput) {
  const content = typeof value.content === "string" ? value.content : "";
  const taskType = value.taskType === "task1" ? "task1" : "task2";
  const status = value.status === "submitted" ? "submitted" : "draft";
  const promptId = typeof value.promptId === "string" && value.promptId.trim() ? value.promptId.trim() : "custom-prompt";
  const durationSeconds = Math.max(0, Math.min(6 * 60 * 60, Number(value.durationSeconds) || 0));
  if (!content.trim()) throw new Error("作文内容不能为空");
  if (content.length > 20000) throw new Error("作文内容不能超过 20,000 个字符");
  return { content, taskType, status, promptId, examSessionId: typeof value.examSessionId === "string" ? value.examSessionId : "", durationSeconds, localDate: value.localDate, wordCount: countWords(content) };
}

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const input = parseAttemptInput(await request.json() as AttemptInput);
    await ensureDatabase();
    const database = getD1();
    if (input.examSessionId && !await database.prepare("SELECT id FROM exam_sessions WHERE id = ? AND account_id = ? AND status = 'in_progress'").bind(input.examSessionId, account.id).first()) return NextResponse.json({ error: "模考记录无效" }, { status: 403 });
    const attemptId = crypto.randomUUID();
    const now = new Date().toISOString();
    if (input.examSessionId) {
      await database.prepare(`INSERT INTO exam_writing_attempts (id, account_id, prompt_id, exam_session_id, task_type, status, duration_seconds, content, word_count, started_at, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(attemptId, account.id, input.promptId, input.examSessionId, input.taskType, input.status, input.durationSeconds, input.content, input.wordCount, now, input.status === "submitted" ? now : null, now).run();
    } else {
      await database.batch([
        database.prepare(`INSERT INTO attempts (id, account_id, prompt_id, exam_session_id, skill, task_type, status, duration_seconds, started_at, submitted_at, updated_at) VALUES (?, ?, ?, NULL, 'writing', ?, ?, ?, ?, ?, ?)`).bind(attemptId, account.id, input.promptId, input.taskType, input.status, input.durationSeconds, now, input.status === "submitted" ? now : null, now),
        database.prepare(`INSERT INTO responses (id, attempt_id, content, word_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), attemptId, input.content, input.wordCount, now, now),
      ]);
      if (input.status === "submitted") await recordExerciseCompletion(account.id, "writing", attemptId, input.localDate);
    }
    return NextResponse.json({ attempt: { id: attemptId, status: input.status } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法保存作文" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await ensureDatabase();
    const promptId = new URL(request.url).searchParams.get("promptId");
    const examSessionId = new URL(request.url).searchParams.get("examSessionId") || "";
    if (promptId) {
      const draft = examSessionId ? await getD1().prepare(`
        SELECT id, duration_seconds AS durationSeconds, updated_at AS updatedAt, content
        FROM exam_writing_attempts
        WHERE account_id = ? AND prompt_id = ? AND exam_session_id = ? AND status = 'draft'
        ORDER BY updated_at DESC LIMIT 1
      `).bind(account.id, promptId, examSessionId).first<Record<string, unknown>>() : await getD1().prepare(`
        SELECT a.id, a.duration_seconds AS durationSeconds, a.updated_at AS updatedAt, r.content
        FROM attempts a JOIN responses r ON r.attempt_id = a.id
        WHERE a.account_id = ? AND a.prompt_id = ? AND a.exam_session_id IS NULL AND a.skill = 'writing' AND a.status = 'draft'
        ORDER BY a.updated_at DESC LIMIT 1
      `).bind(account.id, promptId).first<Record<string, unknown>>();
      return NextResponse.json({ draft: draft ? {
        id: String(draft.id),
        content: String(draft.content || ""),
        durationSeconds: Number(draft.durationSeconds) || 0,
        updatedAt: String(draft.updatedAt),
      } : null });
    }
    const result = await getD1().prepare(`SELECT a.id, a.prompt_id AS promptId, a.task_type AS taskType, a.status, a.duration_seconds AS durationSeconds, a.updated_at AS updatedAt, r.word_count AS wordCount FROM attempts a LEFT JOIN responses r ON r.attempt_id = a.id WHERE a.account_id = ? AND a.exam_session_id IS NULL ORDER BY a.updated_at DESC LIMIT 20`).bind(account.id).all();
    return NextResponse.json({ attempts: result.results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法读取练习记录" }, { status: 500 });
  }
}
