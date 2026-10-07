import type { AccountAiConfiguration } from "../account";
import { requestModelText } from "./client";
import type { ReadingQuestion } from "../reading/library";
import type { ListeningQuestion } from "../listening/library";
import { transcriptSegmentsForTts } from "../listening/transcript";
import type { WritingVisual } from "../writing/library";
import { QUESTION_FORMAT, formatString, normalizeQuestionList, parseModelJson } from "./exercise-format";

export type ExerciseSkill = "listening" | "reading" | "writing";
export type ExerciseDifficulty = "foundation" | "standard" | "advanced";

export type ExerciseGenerationInput = {
  skill: ExerciseSkill;
  difficulty: ExerciseDifficulty;
  topic: string;
  questionCount: number;
  writingTask: "task1" | "task2" | "both";
};

export type GeneratedExercise =
  | { skill: "reading"; title: string; summary: string; article: string; questions: ReadingQuestion[] }
  | { skill: "listening"; title: string; context: string; questionType: string; transcript: string; questions: ListeningQuestion[] }
  | { skill: "writing"; prompts: Array<{ taskType: "task1" | "task2"; title: string; prompt: string; visual?: WritingVisual }> };

function stringValue(value: unknown, maximum = 20_000) {
  return formatString(value, maximum);
}

function stringList(value: unknown, maximumItems: number, maximumLength = 500) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item, maximumLength)).filter(Boolean).slice(0, maximumItems);
}

function generationPrompt(input: ExerciseGenerationInput) {
  const band = input.difficulty === "foundation" ? "Band 5–6" : input.difficulty === "advanced" ? "Band 7–8" : "Band 6–7";
  const topic = input.topic || "choose a realistic contemporary IELTS topic";
  const shared = `Target difficulty: ${band}. Topic preference: ${topic}. The material must be original, factually plausible, self-contained, and suitable for private IELTS practice. Do not copy or imitate a known Cambridge test. Return only valid JSON. Every question must have a non-empty acceptableAnswers array. ${QUESTION_FORMAT}`;
  if (input.skill === "reading") return `${shared}\nCreate one IELTS Academic Reading passage of 650–850 words and exactly ${input.questionCount} answerable questions. Mix two or three suitable types from Multiple Choice, True/False/Not Given, Sentence Completion, and Short Answer. Every answer must be directly supported by the passage. Return this shape: {"title":string,"summary":string,"article":string,"questions":[{"type":string,"instruction":string,"prompt":string,"options":string[],"acceptableAnswers":string[]}]}.`;
  if (input.skill === "listening") return `${shared}\nCreate one IELTS Listening conversation transcript of 400–600 words and exactly ${input.questionCount} answerable questions. The conversation must contain 2–4 distinct people with natural back-and-forth dialogue. Start every spoken turn with a consistent uppercase speaker label such as RECEPTIONIST:, MALE STUDENT:, or DR PATEL:. Never change a person's label during the conversation. The labels will be used to assign a different TTS voice to each person. Mix two suitable types from Note Completion, Multiple Choice, Form Completion, and Short Answer. Answers must appear naturally in the transcript. Return this shape: {"title":string,"context":string,"questionType":string,"transcript":string,"questions":[{"type":string,"instruction":string,"prompt":string,"options":string[],"acceptableAnswers":string[]}]}.`;
  const taskInstruction = input.writingTask === "task1"
    ? "Create exactly one IELTS Academic Writing Task 1 prompt. Do not create or mention a Task 2 prompt. Include all essential chart, table, map, or process data in clear text so the task is usable without an image."
    : input.writingTask === "task2"
      ? "Create exactly one IELTS Academic Writing Task 2 essay prompt. Do not create or mention a Task 1 prompt. Use a clear position, discussion, problem/solution, or advantages/disadvantages instruction."
      : "Create exactly two separate IELTS Academic Writing prompts: one Task 1 and one Task 2. The Task 1 prompt must include all essential chart, table, map, or process data in clear text. The Task 2 prompt must use a clear essay instruction.";
  return `${shared}\n${taskInstruction} For Task 1, choose the visual type that genuinely fits the task; do not default to a line chart. Vary among line, bar, pie, table, process, and map. Line charts are only for change over continuous time; bar charts compare categories; pie charts show composition; tables present exact multi-category values; process diagrams show sequential stages; maps compare locations before and after. Return visual as one of:
  {"type":"line"|"bar"|"pie"|"table","title":string,"subtitle":string,"unit":string,"categories":string[],"series":[{"name":string,"values":number[]}],"sourceNote":string}
  {"type":"process","title":string,"subtitle":string,"steps":[{"title":string,"description":string}],"sourceNote":string}
  {"type":"map","title":string,"subtitle":string,"places":[{"name":string,"kind":"building"|"green"|"water"|"road"|"facility","size":"small"|"medium"|"large","before":string,"after":string,"beforePosition":{"x":number,"y":number},"afterPosition":{"x":number,"y":number}}],"sourceNote":string}.
  For maps, return 5–8 distinct places and realistic normalized coordinates from 8 to 92 for x and y. Use coordinates to create a coherent top-down site plan, preserve unchanged landmarks, and move/add/remove features according to the prompt. Descriptions must state the actual change, not repeat the place name.
  Numeric visuals must use 3–6 categories and 1–5 series and exactly match the prompt. Return this shape: {"prompts":[{"taskType":"task1"|"task2","title":string,"prompt":string,"visual":object|null}]}.`;
}

export function normalizeWritingVisual(value: unknown): WritingVisual | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const type = typeof raw.type === "string" ? raw.type.toLowerCase() : "";
  const common = {
    title: stringValue(raw.title, 300),
    subtitle: stringValue(raw.subtitle, 200),
    sourceNote: stringValue(raw.sourceNote, 300),
  };
  if (type === "process") {
    const steps = Array.isArray(raw.steps) ? raw.steps.slice(0, 8).map((item) => {
      const step = item && typeof item === "object" ? item as Record<string, unknown> : {};
      return { title: stringValue(step.title, 100), description: stringValue(step.description, 300) };
    }).filter((step) => step.title && step.description) : [];
    return steps.length >= 3 ? { type, ...common, steps } : undefined;
  }
  if (type === "map") {
    const places = Array.isArray(raw.places) ? raw.places.slice(0, 8).map((item, index) => {
      const place = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const position = (value: unknown, fallbackX: number, fallbackY: number) => {
        const rawPosition = value && typeof value === "object" ? value as Record<string, unknown> : {};
        const x = Number(rawPosition.x);
        const y = Number(rawPosition.y);
        return {
          x: Number.isFinite(x) ? Math.min(92, Math.max(8, x)) : fallbackX,
          y: Number.isFinite(y) ? Math.min(92, Math.max(8, y)) : fallbackY,
        };
      };
      const fallbackX = 20 + (index % 3) * 30;
      const fallbackY = 22 + Math.floor(index / 3) * 30;
      const kind = ["building", "green", "water", "road", "facility"].includes(String(place.kind)) ? String(place.kind) as "building" | "green" | "water" | "road" | "facility" : "building";
      const size = ["small", "medium", "large"].includes(String(place.size)) ? String(place.size) as "small" | "medium" | "large" : "medium";
      return {
        name: stringValue(place.name, 100),
        kind,
        size,
        before: stringValue(place.before, 200),
        after: stringValue(place.after, 200),
        beforePosition: position(place.beforePosition, fallbackX, fallbackY),
        afterPosition: position(place.afterPosition, fallbackX, fallbackY),
      };
    }).filter((place) => place.name && place.before && place.after) : [];
    return places.length >= 4 ? { type, ...common, places } : undefined;
  }
  if (!["line", "bar", "pie", "table"].includes(type)) return undefined;
  const categories = stringList(raw.categories, 8, 100);
  const series = Array.isArray(raw.series) ? raw.series.slice(0, 6).map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { name: stringValue(row.name, 100), values: Array.isArray(row.values) ? row.values.map(Number) : [] };
  }).filter((item) => item.name && item.values.length === categories.length && item.values.every(Number.isFinite)) : [];
  if (categories.length < 2 || !series.length) return undefined;
  return { type: type as "line" | "bar" | "pie" | "table", ...common, unit: stringValue(raw.unit, 30), categories, series };
}

export async function generateExercise(input: ExerciseGenerationInput, configuration: AccountAiConfiguration): Promise<GeneratedExercise> {
  const content = await requestModelText(configuration, {
      maxTokens: 8_000, temperature: 0.5, json: true,
      messages: [
        { role: "system", content: "You are an expert IELTS item writer. Follow the requested JSON schema exactly and verify that every answer is supported by the generated source material." },
        { role: "user", content: generationPrompt(input) },
      ],
  });
  const parsed = parseModelJson(content);
  const raw = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  if (input.skill === "reading") {
    const title = stringValue(raw.title, 300);
    if (!title) throw new Error("AI 生成的题目缺少标题，请重新生成");
    const article = stringValue(raw.article, 30_000);
    if (article.split(/\s+/u).length < 300) throw new Error("AI 生成的阅读文章过短，请重新生成");
    return { skill: "reading", title, summary: stringValue(raw.summary, 1_000), article, questions: normalizeQuestionList(raw.questions, { expectedCount: input.questionCount, requireAnswers: true }) };
  }
  if (input.skill === "listening") {
    const title = stringValue(raw.title, 300);
    if (!title) throw new Error("AI 生成的题目缺少标题，请重新生成");
    const transcript = stringValue(raw.transcript, 25_000);
    if (transcript.split(/\s+/u).length < 180) throw new Error("AI 生成的听力原文过短，请重新生成");
    const speakers = new Set(transcriptSegmentsForTts(transcript).map((segment) => segment.speaker).filter((speaker) => speaker !== "NARRATOR"));
    if (speakers.size < 2) throw new Error("AI 生成的听力对话人物不足，请重新生成");
    return { skill: "listening", title, context: stringValue(raw.context, 1_000), questionType: stringValue(raw.questionType, 200), transcript, questions: normalizeQuestionList(raw.questions, { expectedCount: input.questionCount, requireAnswers: true }) };
  }
  const expectedTypes = input.writingTask === "both" ? ["task1", "task2"] as const : [input.writingTask];
  const generatedPrompts = Array.isArray(raw.prompts) ? raw.prompts : [];
  const prompts = expectedTypes.map((taskType) => {
    const item = generatedPrompts.find((candidate) => candidate && typeof candidate === "object" && (candidate as Record<string, unknown>).taskType === taskType) as Record<string, unknown> | undefined;
    const title = stringValue(item?.title, 300);
    const prompt = stringValue(item?.prompt, 8_000);
    if (!title || prompt.length < 80) throw new Error(`AI 生成的 Writing ${taskType === "task1" ? "Task 1" : "Task 2"} 信息不足，请重新生成`);
    const visual = taskType === "task1" ? normalizeWritingVisual(item?.visual) : undefined;
    if (taskType === "task1" && !visual) throw new Error("AI 生成的 Task 1 缺少可渲染图表数据，请重新生成");
    return { taskType, title, prompt, visual };
  });
  return { skill: "writing", prompts };
}
