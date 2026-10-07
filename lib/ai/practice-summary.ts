import type { AccountAiConfiguration } from "../account";
import { requestModelText } from "./client";

export type SummarySkill = "listening" | "reading" | "writing" | "speaking";

export type PracticeSummary = {
  overallEstimate: number | null;
  confidence: "low" | "medium" | "high";
  skillEstimates: Record<SummarySkill, number | null>;
  headline: string;
  overview: string;
  strengths: string[];
  weaknesses: Array<{ skill: SummarySkill; issue: string; evidence: string; priority: "high" | "medium" | "low" }>;
  recommendations: Array<{ title: string; reason: string; action: string; frequency: string }>;
  sevenDayPlan: Array<{ day: number; focus: string; task: string; minutes: number }>;
  cautions: string[];
};

export type PracticeSummaryRecord = PracticeSummary & {
  id: string;
  provider: string;
  model: string;
  recordCount: number;
  createdAt: string;
};

export type PracticeEvidence = {
  profile: { targetBand: number; currentBand: number };
  learning: { totalMinutes: number; recentMinutes: number; completedExercises: number };
  totals: Record<"listening" | "reading" | "writing", number>;
  attempts: unknown[];
};

function stringValue(value: unknown, fallback = "", maximum = 2_000) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : fallback;
}

function stringList(value: unknown, maximumItems: number, maximumLength = 500) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item, "", maximumLength)).filter(Boolean).slice(0, maximumItems);
}

function band(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(1, Math.min(9, Math.round(number * 2) / 2));
}

function skill(value: unknown): SummarySkill {
  return value === "listening" || value === "reading" || value === "writing" ? value : "speaking";
}

function priority(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "low" ? value : "medium";
}

function normalizeSummary(value: unknown): PracticeSummary {
  if (!value || typeof value !== "object") throw new Error("AI 返回的学习总结格式无效");
  const raw = value as Record<string, unknown>;
  const estimates = raw.skillEstimates && typeof raw.skillEstimates === "object" ? raw.skillEstimates as Record<string, unknown> : {};
  const weaknesses = Array.isArray(raw.weaknesses) ? raw.weaknesses.slice(0, 8).map((item) => {
    const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      skill: skill(entry.skill),
      issue: stringValue(entry.issue, "需要继续积累有效样本", 500),
      evidence: stringValue(entry.evidence, "当前练习样本有限", 800),
      priority: priority(entry.priority),
    };
  }) : [];
  const recommendations = Array.isArray(raw.recommendations) ? raw.recommendations.slice(0, 6).map((item) => {
    const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      title: stringValue(entry.title, "专项练习", 200),
      reason: stringValue(entry.reason, "用于改善当前薄弱项", 600),
      action: stringValue(entry.action, "完成一次针对性练习并复盘", 800),
      frequency: stringValue(entry.frequency, "每周 3 次", 200),
    };
  }) : [];
  const sevenDayPlan = Array.isArray(raw.sevenDayPlan) ? raw.sevenDayPlan.slice(0, 7).map((item, index) => {
    const entry = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      day: Math.max(1, Math.min(7, Math.floor(Number(entry.day) || index + 1))),
      focus: stringValue(entry.focus, "综合复习", 200),
      task: stringValue(entry.task, "完成一次练习并复盘错题", 800),
      minutes: Math.max(15, Math.min(180, Math.floor(Number(entry.minutes) || 30))),
    };
  }) : [];
  return {
    overallEstimate: band(raw.overallEstimate),
    confidence: raw.confidence === "high" || raw.confidence === "low" ? raw.confidence : "medium",
    skillEstimates: {
      listening: band(estimates.listening),
      reading: band(estimates.reading),
      writing: band(estimates.writing),
      speaking: null,
    },
    headline: stringValue(raw.headline, "你的阶段性 IELTS 学习报告", 300),
    overview: stringValue(raw.overview, "已根据现有练习记录生成阶段性分析。", 2_000),
    strengths: stringList(raw.strengths, 6, 500),
    weaknesses,
    recommendations,
    sevenDayPlan,
    cautions: stringList(raw.cautions, 5, 500),
  };
}

export async function summarizePractice(evidence: PracticeEvidence, configuration: AccountAiConfiguration): Promise<PracticeSummary> {
  const systemPrompt = `You are a rigorous IELTS learning analyst. Analyse only the supplied practice evidence and return one valid JSON object. Never invent attempts, errors, trends, or a Speaking score. Use IELTS band scores from 1 to 9 in whole or half-band increments. Treat Listening and Reading stored band scores as observed practice estimates. Treat Writing AI assessments as non-official estimates and use the four public criteria: Task Achievement/Response, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy. Separate repeated evidence from a one-off result, cite concrete counts/scores/issues in every weakness, and lower confidence when sample size or skill coverage is limited. overallEstimate may average only available Listening, Reading, and Writing estimates, but must be null when evidence is too weak; Speaking must always be null because this product does not collect Speaking attempts. Give concise Simplified Chinese coaching with specific, achievable actions. The seven-day plan must contain exactly seven entries. Include a caution that results are practice estimates, not an official IELTS score.
Return exactly: {"overallEstimate":number|null,"confidence":"low"|"medium"|"high","skillEstimates":{"listening":number|null,"reading":number|null,"writing":number|null,"speaking":null},"headline":string,"overview":string,"strengths":string[],"weaknesses":[{"skill":"listening"|"reading"|"writing"|"speaking","issue":string,"evidence":string,"priority":"high"|"medium"|"low"}],"recommendations":[{"title":string,"reason":string,"action":string,"frequency":string}],"sevenDayPlan":[{"day":number,"focus":string,"task":string,"minutes":number}],"cautions":string[]}.`;
  const content = await requestModelText(configuration, {
      maxTokens: 8_000, temperature: 0.2, json: true,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `请分析以下当前账号的全部已完成练习证据。JSON 数据：\n${JSON.stringify(evidence)}` },
      ],
  });
  const parsed = JSON.parse(content.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "")) as unknown;
  return normalizeSummary(parsed);
}
