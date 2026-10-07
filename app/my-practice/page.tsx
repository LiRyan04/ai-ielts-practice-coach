import type { Metadata } from "next";
import { AppShell } from "../components/app-shell";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getOrCreateAccount } from "../../lib/account";
import { getMyPractice } from "../../lib/practice/history";
import { MyPracticeWorkspace } from "./my-practice-workspace";

export const metadata: Metadata = { title: "我的练习" };
export const dynamic = "force-dynamic";

export default async function MyPracticePage() {
  const identity = await requireChatGPTUser("/my-practice");
  const account = await getOrCreateAccount(identity);
  const data = await getMyPractice(account.id);
  return <AppShell active="myPractice"><MyPracticeWorkspace exams={data.exams} pending={data.pending} records={data.records} /></AppShell>;
}
