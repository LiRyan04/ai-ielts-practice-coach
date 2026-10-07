import Link from "next/link";
import type { ReactNode } from "react";
import { chatGPTSignOutPath, requireChatGPTUser } from "../chatgpt-auth";
import { getAccountSettings, getOrCreateAccount } from "../../lib/account";

export type NavKey = "practice" | "myPractice" | "tutor" | "review" | "library" | "vocabulary" | "resources" | "grammar" | "import" | "settings";

const navItems: Array<{ key: NavKey; label: string; href: string; mark: string }> = [
  { key: "practice", label: "练习中心", href: "/", mark: "▤" },
  { key: "myPractice", label: "我的练习", href: "/my-practice", mark: "⌂" },
  { key: "tutor", label: "AI 助教", href: "/ai-tutor", mark: "✦" },
  { key: "review", label: "错题复盘", href: "/review", mark: "↺" },
  { key: "library", label: "题库", href: "/library", mark: "▥" },
  { key: "vocabulary", label: "生词本", href: "/vocabulary", mark: "Aa" },
  { key: "resources", label: "写作资料", href: "/writing-resources", mark: "¶" },
  { key: "grammar", label: "语法工具", href: "/grammar", mark: "✓" },
  { key: "import", label: "导入材料", href: "/import", mark: "⇧" },
];

const returnPaths: Record<NavKey, string> = {
  practice: "/",
  myPractice: "/my-practice",
  tutor: "/ai-tutor",
  review: "/review",
  library: "/library",
  vocabulary: "/vocabulary",
  resources: "/writing-resources",
  grammar: "/grammar",
  import: "/import",
  settings: "/settings",
};

export async function AppShell({ active, children }: { active: NavKey; children: ReactNode }) {
  const identity = await requireChatGPTUser(returnPaths[active]);
  const account = await getOrCreateAccount(identity);
  const settings = await getAccountSettings(account.id);
  const progress = Math.max(0, Math.min(100, Math.round((settings.currentBand / settings.targetBand) * 100)));
  const initial = account.displayName.trim().slice(0, 1).toUpperCase();
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="AI-IELTS 首页">
          <span>A</span> AI–IELTS
        </Link>

        <nav className="primary-nav" aria-label="主导航">
          {navItems.map((item) => (
            <Link className={active === item.key ? "active" : ""} href={item.href} key={item.key}>
              <span aria-hidden="true">{item.mark}</span>{item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="account-mini">
            <span className="account-avatar" aria-hidden="true">{initial}</span>
            <span><strong>{account.displayName}</strong><small>{account.email}</small></span>
            <Link href={chatGPTSignOutPath("/")} aria-label="退出账号" title="退出账号">↗</Link>
          </div>
          <Link className={active === "settings" ? "sidebar-settings active" : "sidebar-settings"} href="/settings">
            <span aria-hidden="true">⚙</span> 设置
          </Link>
          <div className="goal-mini">
            <div><span>目标分数</span><strong>{settings.targetBand.toFixed(1)}</strong></div>
            <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
            <small>当前预估 {settings.currentBand.toFixed(1)}</small>
          </div>
          <div className="local-status"><i /> 账号数据已同步</div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
