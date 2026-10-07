import { NextResponse } from "next/server";
import { ensureDatabase, getD1 } from "../../../../db";
import { requireRequestAccount } from "../../../../lib/account";
import { recordExerciseCompletion } from "../../../../lib/learning/stats";
import { getListeningPaper } from "../../../../lib/listening/library";
import { scoreListeningPaper } from "../../../../lib/listening/scoring";

function parseAnswers(value: unknown) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(raw).map(([key, answer]) => [key, typeof answer === "string" ? answer.slice(0, 1000) : ""]));
}

function parseProgress(value: unknown) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    sectionIndex: Math.max(0, Math.min(10, Math.floor(Number(raw.sectionIndex) || 0))),
    activeQuestion: Math.max(1, Math.min(100, Math.floor(Number(raw.activeQuestion) || 1))),
    reviewedQuestions: Array.isArray(raw.reviewedQuestions) ? raw.reviewedQuestions.map(Number).filter((number) => Number.isInteger(number) && number > 0 && number <= 100).slice(0, 100) : [],
  };
}

export async function GET(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const paperId = new URL(request.url).searchParams.get("paperId") || "";
    const attemptId = new URL(request.url).searchParams.get("attemptId") || "";
    const examSessionId = new URL(request.url).searchParams.get("examSessionId") || "";
    const list = new URL(request.url).searchParams.get("list") === "1";
    if (!paperId) return NextResponse.json({ error: "缺少听力试卷" }, { status: 400 });
    await ensureDatabase();
    const table = examSessionId ? "exam_listening_attempts" : "listening_attempts";
    if (list) {
      const drafts = await getD1().prepare(`
        SELECT id, answers_json, duration_seconds, started_at, updated_at
        FROM ${table} WHERE account_id = ? AND paper_id = ? AND exam_session_id IS ? AND status = 'draft'
        ORDER BY COALESCE(updated_at, started_at, submitted_at) DESC
      `).bind(account.id, paperId, examSessionId || null).all<Record<string, unknown>>();
      return NextResponse.json({ drafts: drafts.results.map((draft) => ({
        id: String(draft.id),
        answeredCount: Object.values(JSON.parse(String(draft.answers_json || "{}")) as Record<string, string>).filter((answer) => answer.trim()).length,
        durationSeconds: Number(draft.duration_seconds) || 0,
        startedAt: draft.started_at,
        updatedAt: draft.updated_at,
      })) });
    }
    const draft = await getD1().prepare(`
      SELECT id, answers_json, duration_seconds, progress_json, started_at, updated_at
      FROM ${table} WHERE account_id = ? AND paper_id = ? AND exam_session_id IS ? AND status = 'draft' ${attemptId ? "AND id = ?" : ""}
      ORDER BY COALESCE(updated_at, submitted_at) DESC LIMIT 1
    `).bind(...(attemptId ? [account.id, paperId, examSessionId || null, attemptId] : [account.id, paperId, examSessionId || null])).first<Record<string, unknown>>();
    if (!draft) return NextResponse.json({ draft: null });
    return NextResponse.json({ draft: {
      id: String(draft.id),
      answers: JSON.parse(String(draft.answers_json || "{}")),
      durationSeconds: Number(draft.duration_seconds) || 0,
      startedAt: draft.started_at,
      progress: JSON.parse(String(draft.progress_json || "{}")),
      updatedAt: draft.updated_at,
    } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "听力草稿读取失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const input = await request.json() as Record<string, unknown>;
    const paperId = typeof input.paperId === "string" ? input.paperId : "";
    const attemptId = typeof input.attemptId === "string" ? input.attemptId : "";
    const examSessionId = typeof input.examSessionId === "string" ? input.examSessionId : "";
    const forceNew = input.forceNew === true;
    const status = input.status === "draft" ? "draft" : "submitted";
    const answers = parseAnswers(input.answers);
    const progress = parseProgress(input.progress);
    const durationSeconds = Math.max(0, Math.min(3 * 60 * 60, Number(input.durationSeconds) || 0));
    if (!paperId) return NextResponse.json({ error: "缺少听力试卷" }, { status: 400 });
    const paper = await getListeningPaper(paperId, account.id);
    if (!paper) return NextResponse.json({ error: "未找到听力试卷" }, { status: 404 });
    await ensureDatabase();
    const database = getD1();
    const table = examSessionId ? "exam_listening_attempts" : "listening_attempts";
    if (examSessionId && !await database.prepare("SELECT id FROM exam_sessions WHERE id = ? AND account_id = ? AND collection_id = ? AND status = 'in_progress'").bind(examSessionId, account.id, paper.collectionId).first()) return NextResponse.json({ error: "模考记录无效" }, { status: 403 });
    const now = new Date().toISOString();
    const existing = attemptId
      ? await database.prepare(`SELECT id FROM ${table} WHERE id = ? AND account_id = ? AND paper_id = ? AND exam_session_id IS ? AND status = 'draft'`).bind(attemptId, account.id, paperId, examSessionId || null).first<{ id: string }>()
      : forceNew ? null : await database.prepare(`SELECT id FROM ${table} WHERE account_id = ? AND paper_id = ? AND exam_session_id IS ? AND status = 'draft' ORDER BY COALESCE(updated_at, submitted_at) DESC LIMIT 1`).bind(account.id, paperId, examSessionId || null).first<{ id: string }>();
    const id = existing?.id || crypto.randomUUID();

    if (status === "draft") {
      if (existing) {
        await database.prepare(`UPDATE ${table} SET answers_json = ?, duration_seconds = ?, progress_json = ?, updated_at = ? WHERE id = ? AND account_id = ? AND status = 'draft'`)
          .bind(JSON.stringify(answers), durationSeconds, JSON.stringify(progress), now, id, account.id).run();
      } else {
        await database.prepare(`
          INSERT INTO ${table}
            (id, account_id, paper_id, exam_session_id, status, duration_seconds, correct_count, scored_count, band_score, answers_json, result_json, progress_json, started_at, updated_at, submitted_at)
          VALUES (?, ?, ?, ?, 'draft', ?, 0, 0, 0, ?, '{}', ?, ?, ?, ?)
        `).bind(id, account.id, paperId, examSessionId || null, durationSeconds, JSON.stringify(answers), JSON.stringify(progress), now, now, now).run();
      }
      return NextResponse.json({ attempt: { id, status: "draft", updatedAt: now } });
    }

    const result = scoreListeningPaper(paper, answers);
    if (existing) {
      await database.prepare(`
        UPDATE ${table} SET status = 'submitted', duration_seconds = ?, correct_count = ?, scored_count = ?, band_score = ?,
          answers_json = ?, result_json = ?, progress_json = ?, updated_at = ?, submitted_at = ?
        WHERE id = ? AND account_id = ? AND status = 'draft'
      `).bind(durationSeconds, result.correctCount, result.scoredCount, result.bandScore, JSON.stringify(answers), JSON.stringify(result), JSON.stringify(progress), now, now, id, account.id).run();
    } else {
      await database.prepare(`
        INSERT INTO ${table}
          (id, account_id, paper_id, exam_session_id, status, duration_seconds, correct_count, scored_count, band_score, answers_json, result_json, progress_json, started_at, updated_at, submitted_at)
        VALUES (?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, account.id, paperId, examSessionId || null, durationSeconds, result.correctCount, result.scoredCount, result.bandScore, JSON.stringify(answers), JSON.stringify(result), JSON.stringify(progress), now, now, now).run();
    }
    if (!examSessionId) await recordExerciseCompletion(account.id, "listening", id, input.localDate);
    return NextResponse.json({ attempt: { id, status: "submitted" }, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "听力练习保存失败" }, { status: 500 });
  }
}
