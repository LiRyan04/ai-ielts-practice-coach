import { normalizeBand } from "../writing/rules";
import type { AiProvider } from "../account";
import { AiConfigurationError, requestModelText } from "./client";

export { AiConfigurationError } from "./client";

export type AssessmentCriterion = {
  name: string;
  score: number;
  rationale: string;
};

export type SentenceAnnotation = {
  quote: string;
  category: string;
  explanation: string;
  suggestion: string;
};

export type WritingAssessment = {
  overallBand: number;
  confidence: "low" | "medium" | "high";
  criteria: AssessmentCriterion[];
  summary: string;
  strengths: string[];
  issues: string[];
  sentenceAnnotations: SentenceAnnotation[];
  rewritePrompts: string[];
  suggestedRevision: string;
  sampleAnswer: string;
  model: string;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => asString(item)).filter(Boolean) : [];
}

function parseJsonContent(content: string): unknown {
  const withoutFence = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(withoutFence);
}

function normalizeAssessment(value: unknown, model: string, taskType: "task1" | "task2"): WritingAssessment {
  if (!value || typeof value !== "object") throw new Error("AI 模型返回的评分格式无效");
  const raw = value as Record<string, unknown>;
  const confidence = raw.confidence === "low" || raw.confidence === "high" ? raw.confidence : "medium";
  const criteria = Array.isArray(raw.criteria)
    ? raw.criteria.slice(0, 4).map((item, index) => {
        const criterion = item && typeof item === "object" ? item as Record<string, unknown> : {};
        const defaultNames = [taskType === "task1" ? "Task Achievement" : "Task Response", "Coherence & Cohesion", "Lexical Resource", "Grammatical Range & Accuracy"];
        return {
          name: defaultNames[index] ?? `Criterion ${index + 1}`,
          score: normalizeBand(Number(criterion.score)),
          rationale: asString(criterion.rationale, "暂无说明"),
        };
      })
    : [];
  const sentenceAnnotations = Array.isArray(raw.sentenceAnnotations)
    ? raw.sentenceAnnotations.slice(0, 12).map((item) => {
        const annotation = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          quote: asString(annotation.quote),
          category: asString(annotation.category, "language"),
          explanation: asString(annotation.explanation),
          suggestion: asString(annotation.suggestion),
        };
      }).filter((item) => item.quote && item.explanation)
    : [];

  if (criteria.length !== 4) throw new Error("AI 模型未返回完整的四项写作评分");
  return {
    overallBand: normalizeBand(Number(raw.overallBand)),
    confidence,
    criteria,
    summary: asString(raw.summary, "已完成本次写作评估。"),
    strengths: asStringArray(raw.strengths).slice(0, 5),
    issues: asStringArray(raw.issues).slice(0, 6),
    sentenceAnnotations,
    rewritePrompts: asStringArray(raw.rewritePrompts).slice(0, 5),
    suggestedRevision: asString(raw.suggestedRevision),
    sampleAnswer: asString(raw.sampleAnswer),
    model,
  };
}

export async function assessWriting(input: {
  taskType: "task1" | "task2";
  prompt: string;
  essay: string;
}, configuration: { provider: AiProvider; apiKey: string; baseUrl: string; model: string }): Promise<WritingAssessment> {
  const { apiKey, model } = configuration;
  if (!apiKey) throw new AiConfigurationError();

  const taskCriterion = input.taskType === "task1" ? "Task Achievement" : "Task Response";
  const rubric = `You are an IELTS Academic Writing examiner and coach. Estimate performance using the four public IELTS writing criteria. Be strict and evidence-based. Scores must be 0-9 in 0.5 increments. Do not claim this is an official score. Return only one JSON object with this exact shape: {"overallBand": number, "confidence": "low"|"medium"|"high", "criteria": [{"name": string, "score": number, "rationale": string}], "summary": string, "strengths": string[], "issues": string[], "sentenceAnnotations": [{"quote": string, "category": string, "explanation": string, "suggestion": string}], "rewritePrompts": string[], "suggestedRevision": string, "sampleAnswer": string}. The criteria array must contain exactly ${taskCriterion}, Coherence & Cohesion, Lexical Resource, and Grammatical Range & Accuracy. Feedback should be concise and in Simplified Chinese, while quoted essay text, corrections, suggestedRevision and sampleAnswer remain English.`;
  const content = await requestModelText(configuration, {
      maxTokens: 6_000, temperature: 0.2, json: true,
      messages: [
        { role: "system", content: rubric },
        { role: "user", content: `Task type: IELTS Academic Writing ${input.taskType === "task2" ? "Task 2" : "Task 1"}\nPrompt:\n${input.prompt}\n\nCandidate response:\n${input.essay}` },
      ],
  });
  return normalizeAssessment(parseJsonContent(content), model, input.taskType);
}
