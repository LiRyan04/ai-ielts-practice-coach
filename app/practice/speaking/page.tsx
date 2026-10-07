import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Speaking Practice" };

export default function SpeakingPracticePage() {
  redirect("/library");
}
