import { NextResponse } from "next/server";
import { ensureDatabase, getD1 } from "../../../../../db";
import { countWords } from "../../../../../lib/writing/rules";
import { requireRequestAccount } from "../../../../../lib/account";
import { recordExerciseCompletion } from "../../../../../lib/learning/stats";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const { id } = await context.params;
    const value = await request.json() as Record<string, unknown>;
    const content = typeof value.content === "string" ? value.content : "";
    const status = value.status === "submitted" ? "submitted" : "draft";
    const durationSeconds = Math.max(0, Math.min(6 * 60 * 60, Number(value.durationSeconds) || 0));
    if (!content.trim()) throw new Error("作文内容不能为空");
    if (content.length > 20000) throw new Error("作文内容不能超过 20,000 个字符");
    await ensureDatabase();
    const database = getD1();
    const now = new Date().toISOString();
    const examSessionId = typeof value.examSessionId === "string" ? value.examSessionId : "";
    if (examSessionId) {
      const existingExam = await database.prepare(`SELECT a.id FROM exam_writing_attempts a JOIN exam_sessions s ON s.id = a.exam_session_id WHERE a.id = ? AND a.account_id = ? AND a.exam_session_id = ? AND a.status = 'draft' AND s.status = 'in_progress'`).bind(id, account.id, examSessionId).first();
      if (!existingExam) return NextResponse.json({ error: "未找到这次考试答卷" }, { status: 404 });
      await database.prepare(`UPDATE exam_writing_attempts SET status = ?, duration_seconds = ?, content = ?, word_count = ?, submitted_at = ?, updated_at = ? WHERE id = ? AND account_id = ? AND exam_session_id = ? AND status = 'draft'`).bind(status, durationSeconds, content, countWords(content), status === "submitted" ? now : null, now, id, account.id, examSessionId).run();
      return NextResponse.json({ attempt: { id, status } });
    }
    const existing = await database.prepare(`SELECT id FROM attempts WHERE id = ? AND account_id = ? AND exam_session_id IS NULL AND status = 'draft'`).bind(id, account.id).first();
    if (!existing) return NextResponse.json({ error: "未找到这次练习" }, { status: 404 });
    await database.batch([
      database.prepare(`UPDATE attempts SET status = ?, duration_seconds = ?, submitted_at = ?, updated_at = ? WHERE id = ? AND account_id = ?`).bind(status, durationSeconds, status === "submitted" ? now : null, now, id, account.id),
      database.prepare(`UPDATE responses SET content = ?, word_count = ?, updated_at = ? WHERE attempt_id = ? AND EXISTS (SELECT 1 FROM attempts WHERE id = ? AND account_id = ?)`).bind(content, countWords(content), now, id, id, account.id),
    ]);
    if (status === "submitted") await recordExerciseCompletion(account.id, "writing", id, value.localDate);
    return NextResponse.json({ attempt: { id, status } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法更新作文" }, { status: 400 });
  }
}
