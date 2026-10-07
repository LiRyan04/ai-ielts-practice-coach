import { NextResponse } from "next/server";
import { getAccountSettings, requireRequestAccount, saveAccountSettings } from "../../../../lib/account";
import type { AiProvider, TtsProvider } from "../../../../lib/account";

const AI_PROVIDERS = new Set<AiProvider>(["openai-compatible", "openai-responses", "anthropic", "bedrock", "gemini"]);
const TTS_PROVIDERS = new Set<TtsProvider>(["mimo", "dashscope", "openai", "deepgram", "browser"]);

function parseHttpsUrl(value: unknown, label: string, optional = false) {
  const raw = typeof value === "string" ? value.trim().replace(/\/$/, "") : "";
  if (optional && !raw) return "";
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error(`请输入有效的${label}`); }
  if (parsed.protocol !== "https:") throw new Error(`${label}必须使用 HTTPS`);
  return parsed.toString().replace(/\/$/, "");
}

function rejectPrivateApiHost(baseUrl: string) {
  if (!baseUrl) return;
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1" || hostname.endsWith(".local") || /^127\./u.test(hostname) || /^10\./u.test(hostname) || /^192\.168\./u.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./u.test(hostname) || /^169\.254\./u.test(hostname)) {
    throw new Error("API 地址不能指向本机或私有网络");
  }
}

function parseBody(value: Record<string, unknown>) {
  const targetBand = Number(value.targetBand);
  const dailyMinutes = Number(value.dailyMinutes);
  const effectiveLearningMinutes = Number(value.effectiveLearningMinutes);
  const examType = value.examType === "general" ? "general" as const : "academic" as const;
  const interfaceLanguage = value.interfaceLanguage === "en" ? "en" as const : "zh-CN" as const;
  const provider = typeof value.provider === "string" && AI_PROVIDERS.has(value.provider as AiProvider) ? value.provider as AiProvider : "openai-compatible";
  const baseUrl = parseHttpsUrl(value.baseUrl, "文本模型 API 地址");
  const model = typeof value.model === "string" ? value.model.trim() : "";
  const ttsProvider = typeof value.ttsProvider === "string" && TTS_PROVIDERS.has(value.ttsProvider as TtsProvider) ? value.ttsProvider as TtsProvider : "mimo";
  const ttsBaseUrl = parseHttpsUrl(value.ttsBaseUrl, "TTS API 地址", ttsProvider === "browser");
  const ttsModel = typeof value.ttsModel === "string" ? value.ttsModel.trim() : "";
  const ttsVoice = typeof value.ttsVoice === "string" ? value.ttsVoice.trim() : "";
  const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : undefined;
  const ttsApiKey = typeof value.ttsApiKey === "string" ? value.ttsApiKey.trim() : undefined;
  if (!Number.isFinite(targetBand) || targetBand < 4 || targetBand > 9 || targetBand * 2 % 1 !== 0) {
    throw new Error("目标分数需为 4.0–9.0，且以 0.5 递增");
  }
  if (!Number.isInteger(dailyMinutes) || dailyMinutes < 10 || dailyMinutes > 360) {
    throw new Error("每日学习时长需为 10–360 分钟");
  }
  if (!Number.isInteger(effectiveLearningMinutes) || effectiveLearningMinutes < 1 || effectiveLearningMinutes > 180) {
    throw new Error("有效学习时间需为 1–180 分钟");
  }
  // Text-model providers share an OpenAI-compatible transport and may be
  // reached through a public gateway or regional endpoint. Keep the selected
  // provider so provider-specific headers and request options still apply.
  rejectPrivateApiHost(baseUrl);
  rejectPrivateApiHost(ttsBaseUrl);
  if (!model || model.length > 100) throw new Error("请输入有效的模型名称");
  if (ttsProvider !== "browser" && (!ttsModel || !ttsVoice)) throw new Error("请选择有效的 TTS 模型和音色");
  if (apiKey && apiKey.length > 500) throw new Error("API Key 长度无效");
  if (ttsApiKey && ttsApiKey.length > 500) throw new Error("TTS API Key 长度无效");
  return { targetBand, dailyMinutes, effectiveLearningMinutes, examType, interfaceLanguage, provider, baseUrl, model, ttsProvider, ttsBaseUrl, ttsModel, ttsVoice, apiKey, clearApiKey: value.clearApiKey === true, ttsApiKey, clearTtsApiKey: value.clearTtsApiKey === true };
}

export async function GET(request: Request) {
  const account = await requireRequestAccount(request);
  if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  return NextResponse.json({ account, settings: await getAccountSettings(account.id) });
}

export async function PUT(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const value = await request.json() as Record<string, unknown>;
    const current = await getAccountSettings(account.id);
    const section = value.section === "profile" ? "profile" : "models";
    const merged = section === "profile"
      ? { ...current, targetBand: value.targetBand, dailyMinutes: value.dailyMinutes, effectiveLearningMinutes: value.effectiveLearningMinutes, examType: value.examType, interfaceLanguage: value.interfaceLanguage }
      : { ...current, provider: value.provider, baseUrl: value.baseUrl, model: value.model, ttsProvider: value.ttsProvider, ttsBaseUrl: value.ttsBaseUrl, ttsModel: value.ttsModel, ttsVoice: value.ttsVoice, apiKey: value.apiKey, clearApiKey: value.clearApiKey, ttsApiKey: value.ttsApiKey, clearTtsApiKey: value.clearTtsApiKey };
    const input = parseBody(merged);
    await saveAccountSettings(account.id, input);
    return NextResponse.json({ settings: await getAccountSettings(account.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法保存设置" }, { status: 400 });
  }
}
