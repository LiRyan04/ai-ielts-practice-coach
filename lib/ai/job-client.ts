export type AiJobSnapshot = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  result?: Record<string, unknown> | null;
  error?: string | null;
};

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitUntilVisible() {
  if (typeof document === "undefined" || document.visibilityState === "visible") return;
  await new Promise<void>((resolve) => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      resolve();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });
}

function pollingInterval(elapsedMilliseconds: number) {
  if (elapsedMilliseconds < 15_000) return 2_000;
  if (elapsedMilliseconds < 60_000) return 4_000;
  return 8_000;
}

export async function waitForAiJob(id: string, onStatus?: (status: AiJobSnapshot["status"]) => void) {
  const startedAt = Date.now();
  const deadline = startedAt + 10 * 60_000;
  while (Date.now() < deadline) {
    await waitUntilVisible();
    const response = await fetch(`/api/ai-jobs/${encodeURIComponent(id)}`, { cache: "no-store" });
    const payload = await response.json() as { job?: AiJobSnapshot; error?: string };
    if (!response.ok || !payload.job) throw new Error(payload.error || "无法查询后台任务");
    onStatus?.(payload.job.status);
    if (payload.job.status === "completed") return payload.job;
    if (payload.job.status === "failed") throw new Error(payload.job.error || "后台生成失败");
    await delay(pollingInterval(Date.now() - startedAt));
  }
  throw new Error("后台任务仍在运行，可稍后到对应页面查看结果");
}
