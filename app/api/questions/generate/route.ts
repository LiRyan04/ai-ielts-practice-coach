import { NextResponse } from "next/server";
import { requireRequestAccount } from "../../../../lib/account";
import { createAiJob } from "../../../../lib/ai/background-jobs";
import type { ExerciseDifficulty, ExerciseSkill } from "../../../../lib/ai/generate-exercise";

const SKILLS = new Set<ExerciseSkill>(["listening", "reading", "writing"]);
const DIFFICULTIES = new Set<ExerciseDifficulty>(["foundation", "standard", "advanced"]);

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const raw = await request.json().catch(() => ({})) as Record<string, unknown>;
    const skill = typeof raw.skill === "string" && SKILLS.has(raw.skill as ExerciseSkill) ? raw.skill as ExerciseSkill : null;
    const difficulty = typeof raw.difficulty === "string" && DIFFICULTIES.has(raw.difficulty as ExerciseDifficulty) ? raw.difficulty as ExerciseDifficulty : "standard";
    const topic = typeof raw.topic === "string" ? raw.topic.trim().slice(0, 160) : "";
    const questionCount = [5, 8, 10].includes(Number(raw.questionCount)) ? Number(raw.questionCount) : 8;
    const writingTask = raw.writingTask === "task1" || raw.writingTask === "both" ? raw.writingTask : "task2";
    if (!skill) return NextResponse.json({ error: "请选择要生成的题型" }, { status: 400 });

    const job = await createAiJob(account.id, "generate_exercise", { skill, difficulty, topic, questionCount, writingTask });
    return NextResponse.json({ job }, { status: 202, headers: { "x-ai-job-id": job.id } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 出题任务创建失败" }, { status: 500 });
  }
}
