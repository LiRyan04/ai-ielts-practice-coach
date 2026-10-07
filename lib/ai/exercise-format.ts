import type { ReadingQuestion } from "../reading/library";

export const QUESTION_FORMAT = `Each question uses {"number":integer,"type":string,"instruction":string,"prompt":string,"options":string[],"acceptableAnswers":string[]}. Preserve the printed question number and exact wording. For multiple choice, include the option letter with its text in options, but acceptableAnswers may contain the correct letter. For completion questions, retain a visible ____ blank. Never invent an answer: use [] when the supplied answer key is missing or illegible.`;

export function parseModelJson(content: string): Record<string, unknown> {
  const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("模型未返回 JSON 对象");
  return parsed as Record<string, unknown>;
}

export function formatString(value: unknown, maximum = 20_000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function stringList(value: unknown, maximumItems: number, maximumLength = 500) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => formatString(item, maximumLength)).filter(Boolean).slice(0, maximumItems);
}

export function normalizeQuestionList(value: unknown, options: { expectedCount?: number; requireAnswers?: boolean; preserveNumbers?: boolean } = {}): ReadingQuestion[] {
  if (!Array.isArray(value) || !value.length || value.length > 40) throw new Error("题目列表为空或超过 40 道");
  if (options.expectedCount != null && value.length !== options.expectedCount) throw new Error(`应有 ${options.expectedCount} 道题，实际得到 ${value.length} 道`);
  const questions = value.map((item, index) => {
    const raw = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const number = options.preserveNumbers ? Number(raw.number) : index + 1;
    const prompt = formatString(raw.prompt, 2_000);
    const optionsList = stringList(raw.options, 12);
    const acceptableAnswers = stringList(raw.acceptableAnswers, 8);
    if (!Number.isInteger(number) || number < 1 || number > 40 || !prompt) throw new Error(`第 ${index + 1} 道题缺少有效题号或题干`);
    if (options.requireAnswers && !acceptableAnswers.length) throw new Error(`第 ${number} 题缺少答案，请核对答案页`);
    return {
      number,
      type: formatString(raw.type, 100) || (optionsList.length ? "Multiple Choice" : "Short Answer"),
      instruction: formatString(raw.instruction, 1_000),
      prompt,
      options: optionsList,
      acceptableAnswers,
    };
  });
  const numbers = questions.map((question) => question.number);
  if (new Set(numbers).size !== numbers.length || numbers.some((number, index) => index && number !== numbers[index - 1] + 1)) {
    throw new Error("题号必须连续且不能重复");
  }
  return questions;
}
