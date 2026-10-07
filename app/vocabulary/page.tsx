import { SectionPlaceholder } from "../components/section-placeholder";

export const dynamic = "force-dynamic";

export default function VocabularyPage() {
  return <SectionPlaceholder active="vocabulary" eyebrow="VOCABULARY" title="生词本" description="把阅读和写作中遇到的词汇沉淀为个人记忆库。" bullets={["从阅读原文一键收词", "释义、例句与同义表达", "按遗忘曲线安排复习"]} />;
}
