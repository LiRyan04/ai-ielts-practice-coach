import { NextResponse } from "next/server";
import { requireRequestAccount } from "../../../../lib/account";
import { validateImportedMaterial } from "../../../../lib/ai/import-validation";
import { saveGeneratedListeningPaper } from "../../../../lib/listening/library";
import { saveGeneratedReadingPaper } from "../../../../lib/reading/library";
import { saveGeneratedWritingPrompt } from "../../../../lib/writing/library";

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const raw = await request.json() as Record<string, unknown>;
    const skill = raw.skill === "listening" ? "listening" : raw.skill === "reading" ? "reading" : raw.skill === "writing" ? "writing" : null;
    if (!skill) return NextResponse.json({ error: "题型无效" }, { status: 400 });
    const material = validateImportedMaterial(raw.material, skill, true);
    const filename = typeof raw.filename === "string" ? raw.filename.replace(/[\r\n]/gu, " ").slice(0, 200) : "上传材料";
    const sourceReference = `private-upload:${filename}`;
    if (material.skill === "writing") {
      const saved = [];
      for (const prompt of material.prompts) {
        const id = await saveGeneratedWritingPrompt(account.id, { ...prompt, source: sourceReference });
        saved.push({ id, href: `/practice/writing/${id}`, title: prompt.title });
      }
      return NextResponse.json({ id: saved[0].id, href: saved[0].href, saved });
    }
    const id = material.skill === "reading"
      ? await saveGeneratedReadingPaper(account.id, { ...material, difficulty: "Academic", sourceReference, imported: true })
      : await saveGeneratedListeningPaper(account.id, { ...material, sourceReference, imported: true });
    return NextResponse.json({ id, href: `/practice/${skill}/${id}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 500 });
  }
}
