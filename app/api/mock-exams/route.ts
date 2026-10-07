import { NextResponse } from "next/server";
import { requireRequestAccount } from "../../../lib/account";
import { ensureDatabase, getD1 } from "../../../db";
import { emptyMockExamProgress, isWrittenExamComplete, makeMockExamReport, mockExamSkills, parseMockExamBand, parseMockExamProgress, type MockExamSkill } from "../../../lib/practice/mock-exam";

export async function POST(request: Request) {
  const account = await requireRequestAccount(request);
  if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const input = await request.json() as Record<string, unknown>;
  const collectionId = typeof input.collectionId === "string" ? input.collectionId : "";
  const testNumber = Number(input.testNumber);
  const sessionId = typeof input.sessionId === "string" ? input.sessionId : "";
  const strictSession = input.strictSession === true;
  const forceNew = input.forceNew === true;
  if (!collectionId || !Number.isInteger(testNumber)) return NextResponse.json({ error: "考试信息无效" }, { status: 400 });
  await ensureDatabase();
  const database = getD1();
  const saved = !forceNew && sessionId
    ? await database.prepare(`SELECT * FROM exam_sessions WHERE id = ? AND account_id = ? AND collection_id = ? AND test_number = ?`).bind(sessionId, account.id, collectionId, testNumber).first<Record<string, unknown>>()
    : null;
  const existing = saved || (!forceNew ? await database.prepare(`SELECT * FROM exam_sessions WHERE account_id = ? AND collection_id = ? AND test_number = ? AND status = 'in_progress' ORDER BY updated_at DESC LIMIT 1`).bind(account.id, collectionId, testNumber).first<Record<string, unknown>>() : null);
  if (strictSession && sessionId && !saved && !forceNew) return NextResponse.json({ error: "未找到这场考试记录" }, { status: 404 });
  if (existing) return NextResponse.json({ session: { id: String(existing.id), status: existing.status, progress: parseMockExamProgress(existing.progress_json), report: existing.report_json ? JSON.parse(String(existing.report_json)) : null, startedAt: existing.started_at } });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const progress = emptyMockExamProgress();
  await database.prepare(`INSERT INTO exam_sessions (id, account_id, collection_id, test_number, status, progress_json, started_at, updated_at) VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?)`).bind(id, account.id, collectionId, testNumber, JSON.stringify(progress), now, now).run();
  return NextResponse.json({ session: { id, progress, startedAt: now } }, { status: 201 });
}

export async function PATCH(request: Request) {
  const account = await requireRequestAccount(request);
  if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const input = await request.json() as Record<string, unknown>;
  const id = typeof input.id === "string" ? input.id : "";
  const skill = mockExamSkills.includes(input.skill as MockExamSkill) ? input.skill as MockExamSkill : null;
  const status = input.status === "completed" ? "completed" : "in_progress";
  if (!id || !skill) return NextResponse.json({ error: "考试进度无效" }, { status: 400 });
  if (Object.hasOwn(input, "band") && parseMockExamBand(input.band) === null) return NextResponse.json({ error: "考试分数无效" }, { status: 400 });
  await ensureDatabase();
  const database = getD1();
  const row = await database.prepare(`SELECT progress_json FROM exam_sessions WHERE id = ? AND account_id = ?`).bind(id, account.id).first<Record<string, unknown>>();
  if (!row) return NextResponse.json({ error: "考试记录不存在" }, { status: 404 });
  const now = new Date().toISOString();
  const progress = parseMockExamProgress(row.progress_json);
  progress[skill] = { status, attemptId: typeof input.attemptId === "string" ? input.attemptId : progress[skill].attemptId, band: Object.hasOwn(input, "band") ? parseMockExamBand(input.band)! : progress[skill].band, updatedAt: now };
  const complete = isWrittenExamComplete(progress);
  const report = complete ? makeMockExamReport(progress) : null;
  await database.prepare(`UPDATE exam_sessions SET progress_json = ?, status = ?, report_json = ?, updated_at = ?, completed_at = ? WHERE id = ? AND account_id = ?`).bind(JSON.stringify(progress), complete ? "completed" : "in_progress", report ? JSON.stringify(report) : null, now, complete ? now : null, id, account.id).run();
  return NextResponse.json({ session: { id, status: complete ? "completed" : "in_progress", progress, report } });
}

export async function DELETE(request: Request) {
  const account = await requireRequestAccount(request);
  if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "缺少考试记录" }, { status: 400 });
  await ensureDatabase();
  const database = getD1();
  await database.batch([
    database.prepare(`DELETE FROM exam_reading_attempts WHERE exam_session_id = ? AND account_id = ?`).bind(id, account.id),
    database.prepare(`DELETE FROM exam_listening_attempts WHERE exam_session_id = ? AND account_id = ?`).bind(id, account.id),
    database.prepare(`DELETE FROM exam_writing_attempts WHERE exam_session_id = ? AND account_id = ?`).bind(id, account.id),
    database.prepare(`DELETE FROM exam_sessions WHERE id = ? AND account_id = ?`).bind(id, account.id),
  ]);
  return NextResponse.json({ deleted: true });
}
