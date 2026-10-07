import { NextResponse } from "next/server";
import { requireRequestAccount } from "../../../../lib/account";
import { getAiJobForAccount } from "../../../../lib/ai/background-jobs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const account = await requireRequestAccount(request);
  if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const job = await getAiJobForAccount(id, account.id);
  if (!job) return NextResponse.json({ error: "未找到后台任务" }, { status: 404 });
  const headers = job.status === "queued" || job.status === "running" ? { "x-ai-job-id": job.id } : undefined;
  return NextResponse.json({ job }, { headers });
}
