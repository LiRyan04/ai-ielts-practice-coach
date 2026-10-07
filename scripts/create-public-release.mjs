import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const output = resolve(root, ".release/public");
const roots = [
  ".github", ".openai", "app", "build", "db", "drizzle", "lib", "scripts",
  "tests", "worker", "public",
];
const files = [
  ".env.example", ".gitignore", ".nvmrc", "LICENSE", "README.md",
  "THIRD_PARTY_NOTICES.md", "WINDOWS.md", "cloudflare-env.d.ts",
  "drizzle.config.ts", "eslint.config.mjs", "next.config.ts",
  "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
  "postcss.config.mjs", "tsconfig.json", "vite.config.ts",
];
const excluded = new Set([
  ".DS_Store", "node_modules", ".next", ".vinext", ".wrangler", "dist",
  ".release", ".env.local", "tsconfig.tsbuildinfo",
  "reading-library.test.mjs", "listening-library.test.mjs",
  "material-import.test.mjs", "rendered-html.test.mjs",
]);

async function copy(source, destination) {
  await cp(source, destination, {
    recursive: true,
    filter: (path) => {
      const relative = path.slice(root.length + 1).replaceAll("\\", "/");
      if (excluded.has(relative.split("/").at(-1))) return false;
      if (relative === "public/content" || relative.startsWith("public/content/")) return false;
      if (relative === "resource" || relative.startsWith("resource/")) return false;
      return true;
    },
  });
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of roots) await copy(join(root, name), join(output, name));
for (const name of files) await copy(join(root, name), join(output, name));
await mkdir(join(output, "content"), { recursive: true });
const hostingPath = join(output, ".openai", "hosting.json");
const hosting = JSON.parse(await readFile(hostingPath, "utf8"));
hosting.project_id = "replace-with-your-project-id";
await writeFile(hostingPath, JSON.stringify(hosting, null, 2) + "\n");

const placeholders = {
  "reading-library.json": {
    version: 3,
    importedAt: "2026-01-01T00:00:00.000Z",
    source: { repository: "public-release", commit: "empty", privateUseOnly: false },
    stats: { papers: 0, passages: 0, questions: 0 },
    papers: [],
  },
  "listening-library.json": {
    version: 3,
    importedAt: "2026-01-01T00:00:00.000Z",
    sources: {
      content: { repository: "public-release", commit: "empty" },
      audio: { repository: "public-release", revision: "none", tree: "empty", delivery: "none" },
      privateUseOnly: false,
    },
    stats: { papers: 0, sections: 0, questions: 0, audioSections: 0 },
    papers: [],
  },
  "writing-library.json": { prompts: [] },
  "speaking-library.json": { pages: [] },
};
for (const [name, value] of Object.entries(placeholders)) {
  await writeFile(join(output, "content", name), JSON.stringify(value, null, 2) + "\n");
}

// Reintroduce objective-scoring tests without any private exam fixtures.
await writeFile(join(output, "tests", "public-scoring.test.mjs"), `import assert from "node:assert/strict";
import test from "node:test";
import { isReadingAnswerCorrect, scoreReadingPaper } from "../lib/reading/scoring.ts";
import { isListeningAnswerCorrect, scoreListeningPaper } from "../lib/listening/scoring.ts";

test("reading scoring accepts normalized exact answers", () => {
  const question = { number: 1, type: "completion", prompt: "", instruction: "", options: [], acceptableAnswers: ["solar power"] };
  assert.equal(isReadingAnswerCorrect(question, "Solar Power"), true);
  assert.equal(isReadingAnswerCorrect(question, "solar"), false);
  assert.equal(scoreReadingPaper({ passages: [{ id: "p1", questions: [question] }] }, { "1": "solar power" }).correctCount, 1);
});

test("listening scoring accepts exact answers", () => {
  const question = { number: 1, type: "completion", prompt: "", instruction: "", options: [], acceptableAnswers: ["garden"] };
  assert.equal(isListeningAnswerCorrect(question, "Garden"), true);
  assert.equal(scoreListeningPaper({ sections: [{ id: "s1", questions: [question] }] }, { "1": "garden" }).correctCount, 1);
});
`);

// Fail closed if an expected placeholder was not written.
for (const name of Object.keys(placeholders)) {
  const value = JSON.parse(await readFile(join(output, "content", name), "utf8"));
  if (value.papers?.length || value.prompts?.length || value.pages?.length) throw new Error(`Unexpected content in ${name}`);
}
const publicContent = await readdir(join(output, "public"));
if (publicContent.includes("content")) throw new Error("Private public/content assets were copied");

console.log(`Public source snapshot created: ${output}`);
console.log("Review the snapshot, run its checks, and publish it as a new repository with clean history.");
