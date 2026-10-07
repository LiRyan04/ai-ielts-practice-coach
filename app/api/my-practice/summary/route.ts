import { NextResponse } from "next/server";
import { ensureDatabase, getD1 } from "../../../../db";
import { requireRequestAccount } from "../../../../lib/account";
import { createAiJob } from "../../../../lib/ai/background-jobs";

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await ensureDatabase();
    const counts = await getD1().prepare(`SELECT
      (SELECT COUNT(*) FROM listening_attempts WHERE account_id = ? AND status = 'submitted' AND exam_session_id IS NULL) +
      (SELECT COUNT(*) FROM reading_attempts WHERE account_id = ? AND status = 'submitted' AND exam_session_id IS NULL) +
      (SELECT COUNT(*) FROM attempts WHERE account_id = ? AND skill = 'writing' AND status = 'submitted' AND exam_session_id IS NULL) AS record_count`)
      .bind(account.id, account.id, account.id).first<{ record_count: number }>();
    if (!Number(counts?.record_count)) {
      return NextResponse.json({ error: "至少完成一次练习后才能生成 AI 学习总结" }, { status: 400 });
    }
    const job = await createAiJob(account.id, "practice_summary", {});
    return NextResponse.json({ job }, { status: 202, headers: { "x-ai-job-id": job.id } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 学习总结任务创建失败" }, { status: 500 });
  }
}
