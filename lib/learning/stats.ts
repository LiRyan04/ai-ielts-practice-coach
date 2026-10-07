import { ensureDatabase, getD1 } from "../../db";

export const DEFAULT_EFFECTIVE_LEARNING_MINUTES = 15;

export type LearningDay = {
  localDate: string;
  activeSeconds: number;
  completedExercises: number;
  checkedIn: boolean;
};

export type LearningStatus = {
  today: LearningDay & { eligible: boolean; remainingSeconds: number };
  history: LearningDay[];
  streak: number;
  totalMinutes: number;
  checkedDays: number;
  effectiveLearningMinutes: number;
};

type DailyRow = {
  local_date: string;
  active_seconds: number;
  completed_exercises: number;
  checked_in_at: string | null;
  last_heartbeat_at?: string | null;
};

function dateFromKey(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function shiftDate(value: string, days: number): string {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function effectiveLearningMinutes(database: D1Database, accountId: string) {
  const row = await database.prepare("SELECT effective_learning_minutes AS minutes FROM learner_profiles WHERE id = ?")
    .bind(accountId).first<{ minutes: number }>();
  return Math.max(1, Math.min(180, Math.floor(Number(row?.minutes) || DEFAULT_EFFECTIVE_LEARNING_MINUTES)));
}

export function normalizeLocalDate(value: unknown): string {
  const fallback = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = dateFromKey(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return fallback;
  const serverDate = dateFromKey(fallback);
  const difference = Math.abs(parsed.getTime() - serverDate.getTime());
  return difference <= 24 * 60 * 60 * 1000 ? value : fallback;
}

export async function recordLearningHeartbeat(accountId: string, requestedDate: unknown, requestedSeconds: unknown) {
  await ensureDatabase();
  const localDate = normalizeLocalDate(requestedDate);
  const seconds = Math.max(1, Math.min(30, Math.floor(Number(requestedSeconds) || 0)));
  const database = getD1();
  const now = new Date();
  const nowIso = now.toISOString();
  await database.prepare(`
    INSERT INTO learning_daily_stats
      (account_id, local_date, active_seconds, completed_exercises, checked_in_at, last_heartbeat_at, updated_at)
    VALUES (?, ?, ?, 0, NULL, ?, ?)
    ON CONFLICT(account_id, local_date) DO UPDATE SET
      active_seconds = active_seconds + CASE
        WHEN learning_daily_stats.last_heartbeat_at IS NULL THEN excluded.active_seconds
        ELSE MIN(
          excluded.active_seconds,
          MAX(0, CAST((julianday(excluded.last_heartbeat_at) - julianday(learning_daily_stats.last_heartbeat_at)) * 86400 AS INTEGER))
        )
      END,
      last_heartbeat_at = excluded.last_heartbeat_at,
      updated_at = excluded.updated_at
  `).bind(accountId, localDate, seconds, nowIso, nowIso).run();
  return getLearningStatus(accountId, localDate);
}

export async function recordExerciseCompletion(accountId: string, activityType: "listening" | "reading" | "writing", activityId: string, requestedDate: unknown) {
  await ensureDatabase();
  const localDate = normalizeLocalDate(requestedDate);
  const database = getD1();
  const now = new Date().toISOString();
  const result = await database.prepare(`
    INSERT OR IGNORE INTO learning_completions (account_id, activity_type, activity_id, local_date, completed_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(accountId, activityType, activityId, localDate, now).run();
  if (Number(result.meta.changes ?? 0) > 0) {
    await database.prepare(`
      INSERT INTO learning_daily_stats
        (account_id, local_date, active_seconds, completed_exercises, checked_in_at, last_heartbeat_at, updated_at)
      VALUES (?, ?, 0, 1, NULL, NULL, ?)
      ON CONFLICT(account_id, local_date) DO UPDATE SET
        completed_exercises = completed_exercises + 1,
        updated_at = excluded.updated_at
    `).bind(accountId, localDate, now).run();
  }
}

export async function getLearningStatus(accountId: string, requestedDate: unknown): Promise<LearningStatus> {
  await ensureDatabase();
  const localDate = normalizeLocalDate(requestedDate);
  const startDate = shiftDate(localDate, -6);
  const database = getD1();
  const thresholdMinutes = await effectiveLearningMinutes(database, accountId);
  const thresholdSeconds = thresholdMinutes * 60;
  const recent = await database.prepare(`
    SELECT local_date, active_seconds, completed_exercises, checked_in_at
    FROM learning_daily_stats WHERE account_id = ? AND local_date BETWEEN ? AND ? ORDER BY local_date
  `).bind(accountId, startDate, localDate).all<DailyRow>();
  const rowMap = new Map((recent.results ?? []).map((row) => [row.local_date, row]));
  const history = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(startDate, index);
    const row = rowMap.get(date);
    return {
      localDate: date,
      activeSeconds: row?.active_seconds ?? 0,
      completedExercises: row?.completed_exercises ?? 0,
      checkedIn: Boolean(row?.checked_in_at),
    };
  });
  const current = history[history.length - 1];
  const eligible = current.activeSeconds >= thresholdSeconds || current.completedExercises > 0;
  const checkedRows = await database.prepare(`
    SELECT local_date FROM learning_daily_stats
    WHERE account_id = ? AND checked_in_at IS NOT NULL AND local_date <= ?
    ORDER BY local_date DESC LIMIT 366
  `).bind(accountId, localDate).all<{ local_date: string }>();
  const checkedDates = new Set((checkedRows.results ?? []).map((row) => row.local_date));
  let cursor = checkedDates.has(localDate) ? localDate : shiftDate(localDate, -1);
  let streak = 0;
  while (checkedDates.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  const totals = await database.prepare(`
    SELECT COALESCE(SUM(active_seconds), 0) AS total_seconds,
      COALESCE(SUM(CASE WHEN checked_in_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS checked_days
    FROM learning_daily_stats WHERE account_id = ?
  `).bind(accountId).first<{ total_seconds: number; checked_days: number }>();
  return {
    today: {
      ...current,
      eligible,
      remainingSeconds: Math.max(0, thresholdSeconds - current.activeSeconds),
    },
    history,
    streak,
    totalMinutes: Math.floor((totals?.total_seconds ?? 0) / 60),
    checkedDays: totals?.checked_days ?? 0,
    effectiveLearningMinutes: thresholdMinutes,
  };
}

export async function checkIn(accountId: string, requestedDate: unknown): Promise<LearningStatus> {
  await ensureDatabase();
  const localDate = normalizeLocalDate(requestedDate);
  const database = getD1();
  const thresholdMinutes = await effectiveLearningMinutes(database, accountId);
  const thresholdSeconds = thresholdMinutes * 60;
  const row = await database.prepare(`
    SELECT active_seconds, completed_exercises FROM learning_daily_stats WHERE account_id = ? AND local_date = ?
  `).bind(accountId, localDate).first<{ active_seconds: number; completed_exercises: number }>();
  if (!row || (row.active_seconds < thresholdSeconds && row.completed_exercises < 1)) {
    throw new Error(`今天学习满 ${thresholdMinutes} 分钟或完成一次练习后才能签到`);
  }
  const now = new Date().toISOString();
  await database.prepare(`
    UPDATE learning_daily_stats SET checked_in_at = COALESCE(checked_in_at, ?), updated_at = ?
    WHERE account_id = ? AND local_date = ?
  `).bind(now, now, accountId, localDate).run();
  return getLearningStatus(accountId, localDate);
}
