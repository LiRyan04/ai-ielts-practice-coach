import { NextResponse } from "next/server";
import { getAccountAiConfiguration, getAccountTtsConfiguration, requireRequestAccount } from "../../../../lib/account";
import type { AiProvider, TtsProvider } from "../../../../lib/account";

const AI_PROVIDERS = new Set<AiProvider>(["openai-compatible", "openai-responses", "anthropic", "bedrock", "gemini"]);
const TTS_PROVIDERS = new Set<TtsProvider>(["dashscope", "openai", "mimo", "deepgram", "browser"]);

function parseBaseUrl(value: unknown) {
  const raw = typeof value === "string" ? value.trim().replace(/\/+$/u, "") : "";
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("请输入有效的文本模型 API 地址"); }
  if (url.protocol !== "https:") throw new Error("文本模型 API 地址必须使用 HTTPS");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "0.0.0.0" || hostname === "::1" || hostname.endsWith(".local") || /^127\./u.test(hostname) || /^10\./u.test(hostname) || /^192\.168\./u.test(hostname) || /^172\.(1[6-9]|2\d|3[01])\./u.test(hostname) || /^169\.254\./u.test(hostname)) {
    throw new Error("API 地址不能指向本机或私有网络");
  }
  return url.toString().replace(/\/+$/u, "");
}

function modelIds(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const payload = value as Record<string, unknown>;
  const candidates = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : Array.isArray(payload.tts) ? payload.tts : Array.isArray(payload.modelSummaries) ? payload.modelSummaries : [];
  return [...new Set(candidates.map((item) => {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return "";
    const model = item as Record<string, unknown>;
    return typeof model.id === "string" ? model.id : typeof model.model_id === "string" ? model.model_id : typeof model.modelId === "string" ? model.modelId : typeof model.name === "string" ? model.name : "";
  }).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function ownerRoutedModelIds(value: unknown) {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).data)) return [];
  return [...new Set(((value as Record<string, unknown>).data as unknown[]).map((item) => {
    if (!item || typeof item !== "object") return "";
    const model = item as Record<string, unknown>;
    return model.model_type === "llm" && typeof model.id === "string" && typeof model.owned_by === "string" ? `${model.owned_by}/${model.id}` : "";
  }).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function ownerRoutedTtsModelIds(value: unknown) {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).data)) return [];
  return [...new Set(((value as Record<string, unknown>).data as unknown[]).map((item) => {
    if (!item || typeof item !== "object") return "";
    const model = item as Record<string, unknown>;
    const isTts = typeof model.model_type === "string" && model.model_type.includes("tts");
    return isTts && typeof model.id === "string" && typeof model.owned_by === "string" ? `${model.owned_by}/${model.id}` : "";
  }).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function ttsModelIds(provider: TtsProvider, value: unknown) {
  const ids = modelIds(value);
  const filtered = ids.filter((id) => provider === "deepgram" ? /^aura-/iu.test(id) : /tts|speech/iu.test(id));
  const normalized = provider === "deepgram" ? filtered.map((id) => id.match(/^(aura-\d+)/iu)?.[1] || id) : filtered;
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
}

function modelEndpointCandidates(baseUrl: string, kind: "text" | "tts", provider: AiProvider | TtsProvider) {
  if (kind === "tts" && provider === "dashscope") return [`${baseUrl}/compatible-mode/v1/models`];
  if (kind === "text" && provider === "bedrock") return [`${baseUrl.replace("bedrock-runtime.", "bedrock.")}/foundation-models`];
  const url = new URL(baseUrl);
  const path = url.pathname.replace(/\/+$/u, "");
  const stripped = path.replace(/\/(?:chat\/completions|responses|messages|anthropic)$/u, "");
  const origin = url.origin;
  return [...new Set([
    `${origin}${path}/models`,
    `${origin}${stripped}/models`,
    `${origin}${stripped.endsWith("/v1") ? stripped : `${stripped}/v1`}/models`,
  ])];
}

async function fetchFirstModelList(candidates: string[], headers: Record<string, string>) {
  let lastStatus = 0;
  for (const url of candidates) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (response.ok) return response.json() as Promise<unknown>;
    lastStatus = response.status;
    if (response.status === 401 || response.status === 403) throw new Error(`模型列表认证失败（${response.status}），请检查 API Key`);
    if (response.status !== 404 && response.status !== 405) break;
  }
  throw new Error(`未找到可用的模型列表端点${lastStatus ? `（${lastStatus}）` : ""}，仍可手动输入模型名称`);
}

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const body = await request.json() as Record<string, unknown>;
    const kind = body.kind === "tts" ? "tts" : "text";
    const provider = kind === "tts"
      ? typeof body.provider === "string" && TTS_PROVIDERS.has(body.provider as TtsProvider) ? body.provider as TtsProvider : "browser"
      : typeof body.provider === "string" && AI_PROVIDERS.has(body.provider as AiProvider) ? body.provider as AiProvider : "openai-compatible";
    if (provider === "browser") return NextResponse.json({ models: ["browser"] });
    const baseUrl = parseBaseUrl(body.baseUrl);
    const suppliedKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const stored = suppliedKey ? null : kind === "tts" ? await getAccountTtsConfiguration(account.id) : await getAccountAiConfiguration(account.id);
    const apiKey = suppliedKey || (stored?.provider === provider ? stored.apiKey : "");
    if (!apiKey) throw new Error("请先输入 API Key，或保存当前提供商的 API Key");

    const hostname = new URL(baseUrl).hostname.toLowerCase();
    const headers: Record<string, string> = kind === "text" && provider === "anthropic" ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
      : kind === "text" && provider === "gemini" ? { "x-goog-api-key": apiKey }
      : kind === "text" && provider === "openai-compatible" && (hostname === "xiaomimimo.com" || hostname.endsWith(".xiaomimimo.com")) ? { "api-key": apiKey }
      : provider === "mimo" ? { "api-key": apiKey }
      : provider === "deepgram" ? { authorization: `Token ${apiKey}` }
      : { authorization: `Bearer ${apiKey}` };
    const payload = await fetchFirstModelList(modelEndpointCandidates(baseUrl, kind, provider), headers);
    const models = kind === "tts" ? hostname === "api.llm.mioffice.cn" ? ownerRoutedTtsModelIds(payload) : ttsModelIds(provider as TtsProvider, payload)
      : hostname === "api.llm.mioffice.cn" ? ownerRoutedModelIds(payload)
      : modelIds(payload).map((id) => provider === "gemini" ? id.replace(/^models\//u, "") : id);
    if (!models.length) throw new Error(kind === "tts" ? "接口未返回可识别的 TTS 模型，已保留内置列表" : "接口未返回可用模型");
    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法获取模型列表" }, { status: 400 });
  }
}
