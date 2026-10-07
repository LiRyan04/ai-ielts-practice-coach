export const WRITING_TASK_1_MIN_WORDS = 150;
export const WRITING_TASK_2_MIN_WORDS = 250;

export function countWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/u).filter(Boolean).length : 0;
}

export function normalizeBand(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.min(9, Math.max(0, value));
  return Math.round(clamped * 2) / 2;
}

export function validateEssay(
  essay: string,
  taskType: "task1" | "task2",
): { valid: boolean; wordCount: number; errors: string[] } {
  const wordCount = countWords(essay);
  const minWords = taskType === "task1" ? WRITING_TASK_1_MIN_WORDS : WRITING_TASK_2_MIN_WORDS;
  const errors: string[] = [];

  if (!essay.trim()) errors.push("请先完成作文再提交评分。");
  if (wordCount > 0 && wordCount < minWords) {
    errors.push(`当前 ${wordCount} 词，${taskType === "task1" ? "Task 1" : "Task 2"} 建议至少 ${minWords} 词。`);
  }
  if (essay.length > 20000) errors.push("作文内容过长，请控制在 20,000 个字符以内。");

  return { valid: errors.length === 0, wordCount, errors };
}
