import { NextResponse } from "next/server";
import { requireRequestAccount } from "../../../../lib/account";
import { getLearningStatus } from "../../../../lib/learning/stats";

export async function GET(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const localDate = new URL(request.url).searchParams.get("localDate");
    return NextResponse.json({ status: await getLearningStatus(account.id, localDate) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "学习统计读取失败" }, { status: 500 });
  }
}
