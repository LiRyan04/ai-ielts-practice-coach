import { NextResponse } from "next/server";
import { ensureDatabase, getD1 } from "../../../../db";
import { AiConfigurationError, assessWriting } from "../../../../lib/ai/qwen";
import { validateEssay } from "../../../../lib/writing/rules";
import { getAccountAiConfiguration, requireRequestAccount } from "../../../../lib/account";

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const value = await request.json() as Record<string, unknown>;
    const attemptId = typeof value.attemptId === "string" ? value.attemptId : "";
    const prompt = typeof value.prompt === "string" ? value.prompt : "";
    const essay = typeof value.essay === "string" ? value.essay : "";
    const taskType = value.taskType === "task1" ? "task1" : "task2";
    if (!attemptId || !prompt) throw new Error("缺少练习或题目信息");
    const validation = validateEssay(essay, taskType);
    if (!validation.valid) return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });

    await ensureDatabase();
    const database = getD1();
    const existing = await database.prepare(`SELECT id FROM attempts WHERE id = ? AND account_id = ?`).bind(attemptId, account.id).first();
    if (!existing) return NextResponse.json({ error: "未找到这次练习" }, { status: 404 });
    const configuration = await getAccountAiConfiguration(account.id);
    if (!configuration) throw new AiConfigurationError("请先在设置中配置文本 AI Provider 和 API Key");
    const assessment = await assessWriting({ taskType, prompt, essay }, configuration);
    const now = new Date().toISOString();
    await database.batch([
      database.prepare(`INSERT INTO ai_assessments (id, attempt_id, provider, model, overall_band, confidence, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), attemptId, configuration.provider, assessment.model, assessment.overallBand, assessment.confidence, JSON.stringify(assessment), now),
      database.prepare("UPDATE learner_profiles SET current_band = ?, updated_at = ? WHERE id = ?").bind(assessment.overallBand, now, account.id),
    ]);
    return NextResponse.json({ assessment });
  } catch (error) {
    if (error instanceof AiConfigurationError) {
      return NextResponse.json({ error: error.message, code: "AI_NOT_CONFIGURED" }, { status: 503 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 评分失败" }, { status: 500 });
  }
}
