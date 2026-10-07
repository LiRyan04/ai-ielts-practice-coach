"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AiProvider } from "../../../lib/account";
import type { ExerciseDifficulty, ExerciseSkill } from "../../../lib/ai/generate-exercise";

type GeneratedLink = { id: string; href: string; skill: ExerciseSkill; title: string };

const PROVIDER_LABELS: Record<AiProvider, string> = {
  "openai-compatible": "OpenAI Compatible",
  "openai-responses": "OpenAI Responses",
  anthropic: "Anthropic Messages",
  bedrock: "Amazon Bedrock",
  gemini: "Google Gemini",
};

const skillOptions: Array<{ key: ExerciseSkill; label: string; description: string }> = [
  { key: "listening", label: "Listening", description: "生成原文与题目，使用现有 TTS 播放" },
  { key: "reading", label: "Reading", description: "生成学术文章、题目与标准答案" },
  { key: "writing", label: "Writing", description: "生成 Task 1 或 Task 2 写作题" },
];

export function QuestionGenerator({ configured, provider, model }: { configured: boolean; provider: AiProvider; model: string }) {
  const router = useRouter();
  const [skill, setSkill] = useState<ExerciseSkill>("reading");
  const [difficulty, setDifficulty] = useState<ExerciseDifficulty>("standard");
  const [topic, setTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(8);
  const [writingTask, setWritingTask] = useState<"task1" | "task2" | "both">("task2");
  const [state, setState] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [generated, setGenerated] = useState<GeneratedLink | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("generating");
    setMessage("");
    setGenerated(null);
    try {
      const response = await fetch("/api/questions/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skill, difficulty, topic, questionCount, writingTask }),
      });
      const payload = await response.json() as { job?: { id: string }; error?: string };
      if (!response.ok || !payload.job) throw new Error(payload.error || "AI 出题任务创建失败");
      setMessage("任务已提交，正在前往“我的练习”…");
      router.push("/my-practice");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "AI 出题失败");
    }
  }

  return (
    <>
      <header className="page-heading ai-generator-heading">
        <div><Link className="back-link" href="/library">← 返回题库</Link><p className="eyebrow">AI QUESTION GENERATOR</p><h1>生成一套可以直接练习的新题。</h1></div>
      </header>
      <div className="generator-layout">
        <form className="card generator-form" onSubmit={submit}>
          <div className="section-title-row"><div><p className="eyebrow">01 · SKILL</p><h2>选择题型</h2></div><span className={configured ? "config-status ready compact" : "config-status compact"}><i />{configured ? `${PROVIDER_LABELS[provider]} · ${model}` : "文本模型未配置"}</span></div>
          <div className="generator-skill-grid" role="group" aria-label="生成题型">
            {skillOptions.map((option) => <button aria-pressed={skill === option.key} className={skill === option.key ? "active" : ""} key={option.key} onClick={() => setSkill(option.key)} type="button"><strong>{option.label}</strong><small>{option.description}</small></button>)}
          </div>
          <div className="generator-fields">
            <label className="field"><span>目标难度</span><select value={difficulty} onChange={(event) => setDifficulty(event.target.value as ExerciseDifficulty)}><option value="foundation">基础 · Band 5–6</option><option value="standard">标准 · Band 6–7</option><option value="advanced">进阶 · Band 7–8</option></select></label>
            {skill !== "writing" && <label className="field"><span>题目数量</span><select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}><option value="5">5 题 · 快速练习</option><option value="8">8 题 · 标准练习</option><option value="10">10 题 · 完整 Section</option></select></label>}
            {skill === "writing" && <label className="field"><span>写作任务</span><select value={writingTask} onChange={(event) => setWritingTask(event.target.value as "task1" | "task2" | "both")}><option value="task1">Academic Task 1 · 图表/流程/地图</option><option value="task2">Academic Task 2 · 议论文</option><option value="both">Task 1 + Task 2 · 完整写作练习</option></select></label>}
          </div>
          <label className="field generator-topic"><span>主题偏好（可选）</span><textarea maxLength={160} onChange={(event) => setTopic(event.target.value)} placeholder="例如：城市交通、海洋生态、大学教育；留空由 AI 选择 IELTS 常见主题" value={topic} /></label>
          <div className="generator-actions">
            <button className="button button-primary" disabled={!configured || state === "generating"} type="submit">{state === "generating" ? "后台生成中…" : `生成 ${skillOptions.find((item) => item.key === skill)?.label} 题目 →`}</button>
            {!configured && <Link href="/settings">先配置文本 AI Provider</Link>}
            <span className={state === "error" ? "save-message error" : "save-message"} aria-live="polite">{message}</span>
          </div>
        </form>
        <aside className="card generator-result">
          <p className="eyebrow">GENERATED EXERCISE</p>
          {generated ? <><span className="phase-pill">READY</span><h2>{generated.title}</h2><p>{generated.skill === "listening" ? "听力原文和答案已生成，将使用当前 TTS 设置播放。" : generated.skill === "reading" ? "阅读文章、题目和答案已生成。" : "写作题目已生成，可直接计时作答并请求 AI 评分。"}</p><Link className="button button-primary" href={generated.href}>立即开始练习 →</Link><Link className="button button-secondary" href="/my-practice">前往我的练习</Link></> : <><span className="generator-placeholder">AI</span><h2>等待生成</h2><p>每次只生成一套小型练习，便于检查质量。生成成功后会永久保存，并挂起到“我的练习”。</p></>}
        </aside>
      </div>
    </>
  );
}
