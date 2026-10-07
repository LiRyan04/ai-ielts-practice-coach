import { NextResponse } from "next/server";
import { ensureDatabase, getD1 } from "../../../../db";
import { getAccountAiConfiguration, requireRequestAccount } from "../../../../lib/account";
import { requestTutorRecommendations } from "../../../../lib/ai/tutor";

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const assistantMessageId = typeof body.assistantMessageId === "string" ? body.assistantMessageId : "";
    if (!assistantMessageId) return NextResponse.json({ error: "缺少回答信息" }, { status: 400 });

    await ensureDatabase();
    const database = getD1();
    const assistant = await database.prepare(`SELECT id, content, created_at FROM tutor_messages
      WHERE id = ? AND account_id = ? AND role = 'assistant'`).bind(assistantMessageId, account.id).first<{ id: string; content: string; created_at: string }>();
    if (!assistant) return NextResponse.json({ error: "未找到这条回答" }, { status: 404 });
    const user = await database.prepare(`SELECT content FROM tutor_messages
      WHERE account_id = ? AND role = 'user' AND created_at <= ? ORDER BY created_at DESC LIMIT 1`)
      .bind(account.id, assistant.created_at).first<{ content: string }>();
    const configuration = await getAccountAiConfiguration(account.id);
    if (!configuration) return NextResponse.json({ error: "文本模型尚未配置" }, { status: 503 });

    const recommendations = await requestTutorRecommendations({ message: user?.content || "", answer: assistant.content, signal: request.signal }, configuration);
    await database.prepare("UPDATE tutor_messages SET recommendations_json = ? WHERE id = ? AND account_id = ?")
      .bind(JSON.stringify({ questions: recommendations }), assistant.id, account.id).run();
    return NextResponse.json({ recommendations });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法生成推荐追问" }, { status: 500 });
  }
}
