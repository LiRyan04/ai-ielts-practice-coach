"use client";

import { useEffect, useState } from "react";
import { localDateString } from "../../lib/learning/date";
import type { LearningStatus } from "../../lib/learning/stats";

const weekNames = ["日", "一", "二", "三", "四", "五", "六"];

function minutesLabel(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分钟`;
}

export function LearningStatsCard() {
  const [status, setStatus] = useState<LearningStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const date = localDateString();
    void fetch(`/api/learning/status?localDate=${encodeURIComponent(date)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { status?: LearningStatus; error?: string };
        if (!response.ok || !payload.status) throw new Error(payload.error || "学习统计读取失败");
        setStatus(payload.status);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "学习统计读取失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function handleCheckIn() {
    setCheckingIn(true);
    setError(null);
    try {
      const response = await fetch("/api/learning/check-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ localDate: localDateString() }),
      });
      const payload = await response.json() as { status?: LearningStatus; error?: string };
      if (!response.ok || !payload.status) throw new Error(payload.error || "签到失败");
      setStatus(payload.status);
    } catch (checkInError) {
      setError(checkInError instanceof Error ? checkInError.message : "签到失败");
    } finally {
      setCheckingIn(false);
    }
  }

  if (loading) return <article className="card trend-card learning-card-loading">正在汇总学习记录…</article>;
  if (!status) return <article className="card trend-card"><p className="learning-error">{error || "暂时无法读取学习记录"}</p></article>;

  const thresholdSeconds = status.effectiveLearningMinutes * 60;
  const maxSeconds = Math.max(thresholdSeconds, ...status.history.map((day) => day.activeSeconds));
  const todayMinutes = Math.floor(status.today.activeSeconds / 60);
  return (
    <article className="card trend-card learning-stats-card">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">DAILY CHECK-IN</p>
          <h2>学习时长与签到</h2>
        </div>
        <span className="metric-chip">连续 {status.streak} 天</span>
      </div>

      <div className="learning-today-row">
        <div>
          <strong>{todayMinutes}<small> / {status.effectiveLearningMinutes} 分钟</small></strong>
          <span>今日有效学习</span>
        </div>
        <div>
          <strong>{status.today.completedExercises}<small> 次</small></strong>
          <span>完成练习</span>
        </div>
      </div>
      <div className="learning-progress" aria-label={`今日学习 ${todayMinutes} 分钟，签到门槛 ${status.effectiveLearningMinutes} 分钟`}>
        <i style={{ width: `${Math.min(100, status.today.activeSeconds / thresholdSeconds * 100)}%` }} />
      </div>

      <button
        className={`button learning-check-in ${status.today.checkedIn ? "checked" : ""}`}
        type="button"
        disabled={!status.today.eligible || status.today.checkedIn || checkingIn}
        onClick={handleCheckIn}
      >
        {status.today.checkedIn ? "✓ 今日已签到" : checkingIn ? "签到中…" : "今日签到"}
      </button>
      <p className="learning-rule">
        {status.today.checkedIn
          ? `累计学习 ${status.totalMinutes} 分钟 · 已签到 ${status.checkedDays} 天`
          : status.today.eligible
            ? "今日条件已达成，现在可以签到。"
            : `还需有效学习 ${minutesLabel(status.today.remainingSeconds)}，或完成任意一次听、读、写练习。`}
      </p>

      <div className="bar-chart learning-bar-chart" aria-label="近七天有效学习时长">
        {status.history.map((day) => (
          <span key={day.localDate} title={`${day.localDate} · ${Math.floor(day.activeSeconds / 60)} 分钟`}>
            <i className={day.checkedIn ? "checked" : ""} style={{ height: `${Math.max(day.activeSeconds > 0 ? 5 : 0, day.activeSeconds / maxSeconds * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="chart-labels" aria-hidden="true">
        {status.history.map((day) => <span key={day.localDate}>周{weekNames[new Date(`${day.localDate}T00:00:00Z`).getUTCDay()]}</span>)}
      </div>
      {error ? <p className="learning-error">{error}</p> : null}
    </article>
  );
}
