import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Listening Practice" };

export default function ListeningLibraryPage() {
  redirect("/library");
}
