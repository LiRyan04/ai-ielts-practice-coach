import { SectionPlaceholder } from "../components/section-placeholder";

export const dynamic = "force-dynamic";

export default function WritingResourcesPage() {
  return <SectionPlaceholder active="resources" eyebrow="WRITING RESOURCES" title="写作资料" description="集中管理题型框架、范文与自己的高质量表达。" bullets={["Task 1 与 Task 2 题型模板", "高分范文分段精读", "从 AI 评分报告保存表达"]} />;
}
