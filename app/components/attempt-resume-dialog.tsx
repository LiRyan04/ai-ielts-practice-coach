"use client";

export type AttemptChoice = {
  id: string;
  answeredCount: number;
  durationSeconds: number;
  startedAt: string | null;
  updatedAt: string | null;
};

function dateTime(value: string | null) {
  if (!value) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} 分钟` : "不足 1 分钟";
}

export function AttemptResumeDialog({
  attempts,
  busy,
  onRestart,
  onResume,
}: {
  attempts: AttemptChoice[];
  busy: boolean;
  onRestart: () => void;
  onResume: (id: string) => void;
}) {
  return (
    <div className="attempt-dialog-backdrop" role="presentation">
      <section aria-labelledby="attempt-dialog-title" aria-modal="true" className="attempt-dialog" role="dialog">
        <p className="eyebrow">UNFINISHED PRACTICE</p>
        <h2 id="attempt-dialog-title">发现未完成的答题记录</h2>
        <p>你可以重新开始，或选择一条记录从上次位置继续。</p>
        <div className="attempt-choice-list">
          {attempts.map((attempt, index) => (
            <button disabled={busy} key={attempt.id} onClick={() => onResume(attempt.id)} type="button">
              <span><strong>{dateTime(attempt.updatedAt || attempt.startedAt)}</strong>{index === 0 ? <em>最近</em> : null}</span>
              <small>已答 {attempt.answeredCount} 题 · 用时 {duration(attempt.durationSeconds)}</small>
              <b>继续这条记录 →</b>
            </button>
          ))}
        </div>
        <button className="button button-secondary attempt-restart-button" disabled={busy} onClick={onRestart} type="button">重新开始</button>
      </section>
    </div>
  );
}
