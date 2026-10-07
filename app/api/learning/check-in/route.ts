import { NextResponse } from "next/server";
import { requireRequestAccount } from "../../../../lib/account";
import { checkIn } from "../../../../lib/learning/stats";

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const input = await request.json() as Record<string, unknown>;
    return NextResponse.json({ status: await checkIn(account.id, input.localDate) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "签到失败" }, { status: 400 });
  }
}
