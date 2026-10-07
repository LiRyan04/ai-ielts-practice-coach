import { ensureDatabase, getD1 } from "../../db";
import writingLibraryPayload from "../../content/writing-library.json";

export type WritingPrompt = {
  id: string;
  collectionId: string;
  collectionTitle: string;
  taskType: "task1" | "task2";
  title: string;
  prompt: string;
  source: string;
  createdAt: string;
  imageUrl?: string;
  visual?: WritingVisual;
};

export type WritingPromptSummary = Omit<WritingPrompt, "prompt">;

const staticPrompts = (writingLibraryPayload.prompts as WritingPrompt[]).map((prompt) => ({
  ...prompt,
  imageUrl: prompt.imageUrl || undefined,
})) as WritingPrompt[];

type WritingChartVisual = {
  type: "line" | "bar" | "pie" | "table";
  title: string;
  subtitle?: string;
  unit: string;
  categories: string[];
  series: Array<{ name: string; values: number[] }>;
  sourceNote?: string;
};

type WritingProcessVisual = {
  type: "process";
  title: string;
  subtitle?: string;
  steps: Array<{ title: string; description: string }>;
  sourceNote?: string;
};

type WritingMapVisual = {
  type: "map";
  title: string;
  subtitle?: string;
  places: Array<{
    name: string;
    kind: "building" | "green" | "water" | "road" | "facility";
    size: "small" | "medium" | "large";
    before: string;
    after: string;
    beforePosition: { x: number; y: number };
    afterPosition: { x: number; y: number };
  }>;
  sourceNote?: string;
};

type WritingImageVisual = {
  type: "image";
  title: string;
  dataUrl: string;
  sourceNote?: string;
};

export type WritingVisual = WritingChartVisual | WritingProcessVisual | WritingMapVisual | WritingImageVisual;

function parseVisual(value: unknown): WritingVisual | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const visual = JSON.parse(value) as WritingVisual;
    if (visual?.type === "image") return /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/u.test(visual.dataUrl) && visual.dataUrl.length <= 1_500_000 ? visual : undefined;
    if (["line", "bar", "pie", "table"].includes(visual?.type)) {
      const chart = visual as WritingChartVisual;
      return Array.isArray(chart.categories) && Array.isArray(chart.series) ? chart : undefined;
    }
    if (visual?.type === "process") return Array.isArray(visual.steps) ? visual : undefined;
    if (visual?.type === "map" && Array.isArray(visual.places)) {
      return {
        ...visual,
        places: visual.places.map((place, index) => {
          const fallback = { x: 20 + (index % 3) * 30, y: 22 + Math.floor(index / 3) * 30 };
          const words = `${place.name} ${place.before} ${place.after}`.toLowerCase();
          const inferredKind = /(pond|lake|river|stream|water|pool)/u.test(words) ? "water"
            : /(park|garden|tree|forest|wood|lawn|green)/u.test(words) ? "green"
              : /(road|path|street|lane|track)/u.test(words) ? "road"
                : /(parking|playground|sports|court|station)/u.test(words) ? "facility" : "building";
          return {
            ...place,
            kind: place.kind || inferredKind,
            size: place.size || "medium",
            beforePosition: place.beforePosition || fallback,
            afterPosition: place.afterPosition || fallback,
          };
        }),
      };
    }
    return undefined;
  } catch { return undefined; }
}

function inferVisualFromPrompt(title: string, prompt: string): WritingVisual | undefined {
  const rows = [...prompt.matchAll(/(?:In\s+)?(\d{4})\s*:\s*([^.]+)/giu)];
  if (rows.length < 2) return undefined;
  const parsed = rows.map((row) => ({
    category: row[1],
    values: [...row[2].matchAll(/([A-Za-z][A-Za-z -]*?)\s+(\d+(?:\.\d+)?)%/gu)]
      .map((match) => ({ name: match[1].trim().replace(/^and\s+/iu, ""), value: Number(match[2]) })),
  }));
  const names = parsed[0]?.values.map((item) => item.name) || [];
  if (!names.length || parsed.some((row) => row.values.length !== names.length)) return undefined;
  return {
    type: "line",
    title,
    subtitle: parsed.map((row) => row.category).join("–"),
    unit: "%",
    categories: parsed.map((row) => row.category),
    series: names.map((name, index) => ({ name, values: parsed.map((row) => row.values[index].value) })),
    sourceNote: "Data supplied in the generated task.",
  };
}

export async function listWritingPrompts(accountId: string): Promise<WritingPromptSummary[]> {
  await ensureDatabase();
  const result = await getD1().prepare(`
    SELECT id, collection_id AS collectionId, task_type AS taskType, title, source, created_at AS createdAt
    FROM writing_prompts
    WHERE account_id = ?
    ORDER BY created_at DESC
  `).bind(accountId).all<Record<string, unknown>>();
  const generated: WritingPromptSummary[] = result.results.map((row) => ({
    id: String(row.id),
    collectionId: String(row.collectionId || "ai"),
    collectionTitle: String(row.source || "").startsWith("private-upload:") ? "我的导入材料" : "AI 私人题库",
    taskType: row.taskType === "task1" ? "task1" : "task2",
    title: String(row.title),
    source: typeof row.source === "string" ? row.source : "AI generated",
    createdAt: String(row.createdAt),
  }));
  return [...staticPrompts, ...generated];
}

export async function getWritingPrompt(id: string, accountId: string): Promise<WritingPrompt | null> {
  const staticPrompt = staticPrompts.find((prompt) => prompt.id === id);
  if (staticPrompt) return staticPrompt;
  await ensureDatabase();
  const row = await getD1().prepare(`
    SELECT id, collection_id AS collectionId, task_type AS taskType, title, prompt, visual_json AS visualJson, source, created_at AS createdAt
    FROM writing_prompts WHERE id = ? AND account_id = ?
  `).bind(id, accountId).first<Record<string, unknown>>();
  if (!row) return null;
  const title = String(row.title);
  const prompt = String(row.prompt);
  return {
    id: String(row.id),
    collectionId: String(row.collectionId || "ai"),
    collectionTitle: String(row.source || "").startsWith("private-upload:") ? "我的导入材料" : "AI 私人题库",
    taskType: row.taskType === "task1" ? "task1" : "task2",
    title,
    prompt,
    source: typeof row.source === "string" ? row.source : "AI generated",
    createdAt: String(row.createdAt),
    visual: parseVisual(row.visualJson) || (row.taskType === "task1" ? inferVisualFromPrompt(title, prompt) : undefined),
  };
}

export async function saveGeneratedWritingPrompt(accountId: string, input: {
  taskType: "task1" | "task2";
  title: string;
  prompt: string;
  visual?: WritingVisual;
  source: string;
}) {
  await ensureDatabase();
  const id = `ai-writing-${crypto.randomUUID()}`;
  await getD1().prepare(`
    INSERT INTO writing_prompts (id, account_id, collection_id, task_type, title, prompt, visual_json, source, created_at)
    VALUES (?, ?, 'ai', ?, ?, ?, ?, ?, ?)
  `).bind(id, accountId, input.taskType, input.title, input.prompt, input.visual ? JSON.stringify(input.visual) : null, input.source, new Date().toISOString()).run();
  return id;
}
