import type { AccountAiConfiguration } from "../account";
import { requestModelText } from "./client";
import type { DiagnosisItem, ReviewSkill } from "../review/history";

export type DiagnosisInput = {
  skill: ReviewSkill;
  title: string;
  sourceMaterial: string;
  questions: Array<{ questionNumber: number; prompt: string; options: string[]; answer: string; correctAnswer: string }>;
};

export type DiagnosisResult = { summary: string; patterns: string[]; items: DiagnosisItem[] };

function text(value: unknown, fallback: string, maximum = 1_500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : fallback;
}

function normalizeResult(value: unknown, input: DiagnosisInput): DiagnosisResult {
  if (!value || typeof value !== "object") throw new Error("AI 返回的错题诊断格式无效");
  const raw = value as Record<string, unknown>;
  const returned = Array.isArray(raw.items) ? raw.items : [];
  const byQuestion = new Map<number, Record<string, unknown>>();
  for (const value of returned) {
    if (!value || typeof value !== "object") continue;
    const item = value as Record<string, unknown>;
    const questionNumber = Number(item.questionNumber);
    if (Number.isFinite(questionNumber)) byQuestion.set(questionNumber, item);
  }
  const items = input.questions.map((question) => {
    const item = byQuestion.get(question.questionNumber) || {};
    return {
      questionNumber: question.questionNumber,
      errorType: text(item.errorType, input.skill === "listening" ? "信息捕捉或干扰项" : "定位或同义替换", 120),
      analysis: text(item.analysis, `你的答案“${question.answer || "未作答"}”与标准答案“${question.correctAnswer}”不一致，需要重新核对定位过程。`),
      evidence: text(item.evidence, "当前材料中未能定位可靠证据，请回到原文或录音答案句核对。"),
      paraphrases: Array.isArray(item.paraphrases) ? item.paraphrases.slice(0, 6).map((pair) => {
        const rawPair = pair && typeof pair === "object" ? pair as Record<string, unknown> : {};
        return { source: text(rawPair.source, "", 200), replacement: text(rawPair.replacement, "", 200) };
      }).filter((pair) => pair.source || pair.replacement) : [],
      nextAction: text(item.nextAction, input.skill === "listening" ? "精听答案句前后两句并标出信息修正词。" : "回读定位段并标出题干与原文的对应表达。", 500),
    };
  });
  return {
    summary: text(raw.summary, `已对 ${items.length} 道错题完成证据化诊断。`, 1_200),
    patterns: Array.isArray(raw.patterns) ? raw.patterns.map((item) => text(item, "", 300)).filter(Boolean).slice(0, 6) : [],
    items,
  };
}

export async function diagnoseMistakes(input: DiagnosisInput, configuration: AccountAiConfiguration): Promise<DiagnosisResult> {
  const modeRule = input.skill === "listening"
    ? "For Listening, identify distractor corrections, missed signposts, spelling/form errors, numbers/names, and paraphrase recognition. Evidence must quote or closely point to the supplied transcript when available."
    : "For Reading, identify locating errors, paraphrase failure, scope changes, True/False/Not Given logic, heading scope, word-limit errors, and unsupported inference. Evidence must quote the supplied passage when available.";
  const system = `You are a rigorous IELTS ${input.skill} error-diagnosis teacher. The application has already marked every supplied item wrong by deterministic answer comparison. You must never change correctness or replace the supplied official answer. Diagnose the learner's reasoning or attention failure using only supplied source material and question data. ${modeRule} If the source does not contain enough evidence, explicitly say that instead of inventing a quote. Give one concrete retraining action per item. Respond in concise Simplified Chinese, while preserving English source phrases. Return only valid JSON: {"summary":string,"patterns":string[],"items":[{"questionNumber":number,"errorType":string,"analysis":string,"evidence":string,"paraphrases":[{"source":string,"replacement":string}],"nextAction":string}]}. Include every supplied question exactly once.`;
  const content = await requestModelText(configuration, {
      maxTokens: 7_000, temperature: 0.15, json: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ title: input.title, skill: input.skill, sourceMaterial: input.sourceMaterial.slice(0, 12_000), wrongQuestions: input.questions }) },
      ],
  });
  const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "")) as unknown;
  return normalizeResult(parsed, input);
}
