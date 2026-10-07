import { SectionPlaceholder } from "../components/section-placeholder";

export const dynamic = "force-dynamic";

export default function GrammarPage() {
  return <SectionPlaceholder active="grammar" eyebrow="GRAMMAR LAB" title="语法工具" description="把写作报告中的语言问题转换成可重复训练的语法任务。" bullets={["按错误类型自动归类", "上下文改写练习", "追踪重复错误是否减少"]} />;
}
