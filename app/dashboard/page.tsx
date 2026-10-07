import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "学习概览",
};
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  redirect("/");
}
