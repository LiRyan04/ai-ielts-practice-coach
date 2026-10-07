import { NextResponse } from "next/server";
import { requireRequestAccount } from "../../../../lib/account";
import { recordLearningHeartbeat } from "../../../../lib/learning/stats";

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const input = await request.json() as Record<string, unknown>;
    return NextResponse.json({ status: await recordLearningHeartbeat(account.id, input.localDate, input.seconds) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "学习时长记录失败" }, { status: 400 });
  }
}
