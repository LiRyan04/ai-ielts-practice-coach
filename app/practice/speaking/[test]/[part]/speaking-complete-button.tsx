"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SpeakingCompleteButton({ examSession, test }: { examSession: string; test: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className="button button-primary" disabled={busy} onClick={async () => {
    setBusy(true);
    await fetch("/api/mock-exams", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: examSession, skill: "speaking", status: "completed" }) });
    router.push(`/mock/21/${test}`);
  }} type="button">{busy ? "保存中…" : "完成考试"}</button>;
}
