import { NextResponse } from "next/server";
import { getAccountAiConfiguration, requireRequestAccount } from "../../../../lib/account";
import { convertImportedMaterial } from "../../../../lib/ai/import-material";
import type { ImportSkill } from "../../../../lib/ai/import-validation";

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const raw = await request.json() as Record<string, unknown>;
    const skill = raw.skill === "listening" ? "listening" : raw.skill === "reading" ? "reading" : raw.skill === "writing" ? "writing" : null;
    if (!skill) return NextResponse.json({ error: "请选择阅读、听力或写作" }, { status: 400 });
    const questionText = typeof raw.questionText === "string" ? raw.questionText.slice(0, 75_000) : "";
    const answerText = typeof raw.answerText === "string" ? raw.answerText.slice(0, 15_000) : "";
    const sourceText = typeof raw.sourceText === "string" ? raw.sourceText.slice(0, 40_000) : "";
    const sourceImage = typeof raw.sourceImage === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/u.test(raw.sourceImage) && raw.sourceImage.length <= 1_500_000 ? raw.sourceImage : undefined;
    if (questionText.trim().length < (skill === "writing" ? 60 : 200) || (skill !== "writing" && answerText.trim().length < 20)) return NextResponse.json({ error: "请先提取完整的题目页和答案页" }, { status: 400 });
    if (skill === "listening" && sourceText.trim().length < 200) return NextResponse.json({ error: "听力还需要提取 Audioscripts 页" }, { status: 400 });
    const configuration = await getAccountAiConfiguration(account.id);
    if (!configuration) return NextResponse.json({ error: "请先在设置中配置文本模型" }, { status: 400 });
    const material = await convertImportedMaterial({ skill: skill as ImportSkill, questionText, answerText, sourceText, sourceImage }, configuration);
    return NextResponse.json({ material });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "材料转换失败" }, { status: 500 });
  }
}
