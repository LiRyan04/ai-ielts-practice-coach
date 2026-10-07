import { NextResponse } from "next/server";
import { ensureDatabase, getD1 } from "../../../../../../../db";
import { requireRequestAccount } from "../../../../../../../lib/account";

type Params = { kind: string; skill: string; id: string };

export async function DELETE(request: Request, context: { params: Promise<Params> }) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const { kind, skill, id } = await context.params;
    if ((kind !== "record" && kind !== "exercise" && kind !== "job") || !["listening", "reading", "writing"].includes(skill)) {
      return NextResponse.json({ error: "删除目标无效" }, { status: 400 });
    }
    await ensureDatabase();
    const database = getD1();

    if (kind === "job") {
      const failedJob = await database.prepare("SELECT id FROM ai_jobs WHERE id = ? AND account_id = ? AND type = 'generate_exercise' AND status = 'failed'")
        .bind(id, account.id).first();
      if (!failedJob) return NextResponse.json({ error: "未找到可删除的失败任务" }, { status: 404 });
      await database.prepare("DELETE FROM ai_jobs WHERE id = ? AND account_id = ? AND status = 'failed'").bind(id, account.id).run();
      return NextResponse.json({ deleted: { kind, skill, id } });
    }

    if (kind === "record") {
      const table = skill === "writing" ? "attempts" : `${skill}_attempts`;
      const owned = await database.prepare(`SELECT id FROM ${table} WHERE id = ? AND account_id = ? AND exam_session_id IS NULL`).bind(id, account.id).first();
      if (!owned) return NextResponse.json({ error: "未找到这条练习记录" }, { status: 404 });
      const adjustCompletion = database.prepare(`UPDATE learning_daily_stats SET completed_exercises = MAX(0, completed_exercises - 1), updated_at = ?
        WHERE account_id = ? AND local_date = (SELECT local_date FROM learning_completions WHERE account_id = ? AND activity_type = ? AND activity_id = ?)`)
        .bind(new Date().toISOString(), account.id, account.id, skill, id);
      if (skill === "writing") {
        await database.batch([
          database.prepare("DELETE FROM ai_assessments WHERE attempt_id = ?").bind(id),
          database.prepare("DELETE FROM writing_revisions WHERE attempt_id = ?").bind(id),
          database.prepare("DELETE FROM responses WHERE attempt_id = ?").bind(id),
          adjustCompletion,
          database.prepare("DELETE FROM learning_completions WHERE account_id = ? AND activity_type = 'writing' AND activity_id = ?").bind(account.id, id),
          database.prepare("DELETE FROM attempts WHERE id = ? AND account_id = ? AND exam_session_id IS NULL").bind(id, account.id),
          database.prepare("DELETE FROM practice_summaries WHERE account_id = ?").bind(account.id),
          database.prepare("DELETE FROM practice_diagnoses WHERE account_id = ? AND attempt_id = ?").bind(account.id, id),
        ]);
      } else {
        await database.batch([
          adjustCompletion,
          database.prepare("DELETE FROM learning_completions WHERE account_id = ? AND activity_type = ? AND activity_id = ?").bind(account.id, skill, id),
          database.prepare(`DELETE FROM ${table} WHERE id = ? AND account_id = ? AND exam_session_id IS NULL`).bind(id, account.id),
          database.prepare("DELETE FROM practice_summaries WHERE account_id = ?").bind(account.id),
          database.prepare("DELETE FROM practice_diagnoses WHERE account_id = ? AND attempt_id = ?").bind(account.id, id),
        ]);
      }
      return NextResponse.json({ deleted: { kind, skill, id } });
    }

    if (skill === "writing") {
      const prompt = await database.prepare("SELECT id FROM writing_prompts WHERE id = ? AND account_id = ?").bind(id, account.id).first();
      if (!prompt) return NextResponse.json({ error: "未找到这道私人写作题" }, { status: 404 });
      const used = await database.prepare("SELECT id FROM attempts WHERE prompt_id = ? UNION ALL SELECT id FROM exam_writing_attempts WHERE prompt_id = ? LIMIT 1").bind(id, id).first();
      if (used) return NextResponse.json({ error: "这道题已有练习记录，请先删除对应记录" }, { status: 409 });
      await database.prepare("DELETE FROM writing_prompts WHERE id = ? AND account_id = ?").bind(id, account.id).run();
    } else {
      const papers = `${skill}_papers`;
      const attempts = `${skill}_attempts`;
      const children = skill === "reading" ? "reading_passages" : "listening_sections";
      const paper = await database.prepare(`SELECT id FROM ${papers} WHERE id = ? AND owner_account_id = ?`).bind(id, account.id).first();
      if (!paper) return NextResponse.json({ error: "未找到这道私人题目" }, { status: 404 });
      const used = await database.prepare(`SELECT id FROM ${attempts} WHERE paper_id = ? UNION ALL SELECT id FROM exam_${attempts} WHERE paper_id = ? LIMIT 1`).bind(id, id).first();
      if (used) return NextResponse.json({ error: "这道题已有练习记录，请先删除对应记录" }, { status: 409 });
      await database.batch([
        database.prepare(`DELETE FROM ${children} WHERE paper_id = ?`).bind(id),
        database.prepare(`DELETE FROM ${papers} WHERE id = ? AND owner_account_id = ?`).bind(id, account.id),
      ]);
    }
    return NextResponse.json({ deleted: { kind, skill, id } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 500 });
  }
}
