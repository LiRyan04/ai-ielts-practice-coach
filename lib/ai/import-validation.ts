import { formatString, normalizeQuestionList } from "./exercise-format";
import { normalizeWritingVisual } from "./generate-exercise";

export type ImportSkill = "reading" | "listening" | "writing";

export function validateImportedMaterial(value: unknown, skill: ImportSkill, requireAnswers = true) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (skill === "writing") {
    const rawPrompts = Array.isArray(raw.prompts) ? raw.prompts : [];
    const prompts = rawPrompts.slice(0, 2).map((value) => {
      const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
      const taskType: "task1" | "task2" | null = item.taskType === "task1" ? "task1" : item.taskType === "task2" ? "task2" : null;
      const title = formatString(item.title, 300);
      const prompt = formatString(item.prompt, 8_000);
      const rawVisual = item.visual && typeof item.visual === "object" ? item.visual as Record<string, unknown> : {};
      const imageVisual = rawVisual.type === "image" && typeof rawVisual.dataUrl === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/u.test(rawVisual.dataUrl) && rawVisual.dataUrl.length <= 1_500_000
        ? { type: "image" as const, title: formatString(rawVisual.title, 300) || title, dataUrl: rawVisual.dataUrl, sourceNote: "Original PDF page" }
        : undefined;
      const visual = taskType === "task1" ? imageVisual || normalizeWritingVisual(item.visual) : undefined;
      if (!taskType || !title || prompt.length < 40) throw new Error("写作题缺少 Task 类型、标题或题干");
      if (taskType === "task1" && !visual) throw new Error("Writing Task 1 缺少完整可渲染的图表数据，请核对并补全 visual");
      return { taskType, title, prompt, visual };
    });
    if (!prompts.length || new Set(prompts.map((item) => item.taskType)).size !== prompts.length) throw new Error("写作题应包含一个或两个不同的 Task");
    return { skill, prompts } as const;
  }
  const title = formatString(raw.title, 300);
  if (!title) throw new Error("缺少材料标题");
  const questions = normalizeQuestionList(raw.questions, { preserveNumbers: true, requireAnswers });
  if (skill === "reading") {
    const article = formatString(raw.article, 30_000);
    if (article.length < 300) throw new Error("阅读文章过短，请补全原文");
    return { skill, title, summary: formatString(raw.summary, 1_000), article, questions } as const;
  }
  const transcript = formatString(raw.transcript, 25_000);
  if (transcript.length < 200) throw new Error("听力原文过短，请同时导入 Audioscripts 页");
  return { skill, title, context: formatString(raw.context, 1_000), questionType: formatString(raw.questionType, 200), transcript, questions } as const;
}
