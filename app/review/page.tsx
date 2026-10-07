import type { Metadata } from "next";
import { AppShell } from "../components/app-shell";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getOrCreateAccount } from "../../lib/account";
import { getReviewData } from "../../lib/review/history";
import { ReviewWorkspace } from "./review-workspace";

export const metadata: Metadata = { title: "错题复盘" };
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const identity = await requireChatGPTUser("/review");
  const account = await getOrCreateAccount(identity);
  const data = await getReviewData(account.id);
  return <AppShell active="review"><ReviewWorkspace {...data} /></AppShell>;
}
