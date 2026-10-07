import Link from "next/link";
import { AppShell, type NavKey } from "./app-shell";

export function SectionPlaceholder({
  active,
  eyebrow,
  title,
  bullets,
}: {
  active: NavKey;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <AppShell active={active}>
      <header className="page-heading compact-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
        </div>
      </header>
      <section className="placeholder-grid">
        <article className="card placeholder-main">
          <span className="phase-pill">IN DEVELOPMENT</span>
          <h2>入口已经纳入学习流程</h2>
          <p>这个模块已按完整 IELTS 练习产品的结构预留，后续会接入真实内容和账号数据。</p>
          <ul>{bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
          <Link className="button button-primary" href="/library">前往题库选择写作题 →</Link>
        </article>
        <aside className="card next-card">
          <p className="eyebrow">BUILD ORDER</p>
          <strong>当前开发重点</strong>
          <ol>
            <li className="done">练习中心与题库</li>
            <li className="done">写作练习与 AI 评分</li>
            <li className="current">阅读错题与学习工具</li>
            <li>听力、口语与完整模考</li>
          </ol>
        </aside>
      </section>
    </AppShell>
  );
}
