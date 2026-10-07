import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getAccountTtsConfiguration, requireRequestAccount, type AccountTtsConfiguration, type TtsProvider } from "../../../lib/account";

const CACHE_VERSION = "v3";
const MAX_TEXT_LENGTH = 12_000;
type Provider = Exclude<TtsProvider, "browser">;
type GeneratedAudio = { bytes: ArrayBuffer; contentType: string };

function runtimeKey(provider: TtsProvider) {
  const names: Partial<Record<TtsProvider, string>> = { mimo: "MIMO_API_KEY", dashscope: "DASHSCOPE_API_KEY", openai: "OPENAI_API_KEY", deepgram: "DEEPGRAM_API_KEY" };
  const name = names[provider];
  if (!name) return "";
  const workerValue = (env as unknown as Record<string, unknown>)[name];
  return (typeof workerValue === "string" ? workerValue : process.env[name] || "").trim();
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function mimoModelId(baseUrl: string, model: string) {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  return hostname === "api.llm.mioffice.cn" && !model.includes("/") ? `xiaomi/${model}` : model;
}

async function generateMimo(text: string, configuration: AccountTtsConfiguration): Promise<GeneratedAudio> {
  const response = await fetch(`${configuration.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "api-key": configuration.apiKey, "content-type": "application/json" },
    body: JSON.stringify({ model: mimoModelId(configuration.baseUrl, configuration.model), messages: [{ role: "assistant", content: text }], audio: { format: "wav", voice: configuration.voice } }),
  });
  const payload = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { audio?: { data?: string } } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `MiMo TTS 请求失败（${response.status}）`);
  const audio = payload.choices?.[0]?.message?.audio?.data;
  if (!audio) throw new Error("MiMo TTS 没有返回音频数据");
  return { bytes: decodeBase64(audio), contentType: "audio/wav" };
}

function qwenEndpoint(baseUrl: string) {
  const hostname = new URL(baseUrl).hostname;
  const regionalHost = hostname.includes("intl") ? "dashscope-intl.aliyuncs.com" : hostname.includes("us") ? "dashscope-us.aliyuncs.com" : "dashscope.aliyuncs.com";
  return `https://${regionalHost}/api/v1/services/aigc/multimodal-generation/generation`;
}

async function generateQwen(text: string, configuration: AccountTtsConfiguration): Promise<GeneratedAudio> {
  const response = await fetch(qwenEndpoint(configuration.baseUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${configuration.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: configuration.model, input: { text, voice: configuration.voice, language_type: "English" } }),
  });
  const payload = await response.json().catch(() => ({})) as { output?: { audio?: { url?: string } }; code?: string; message?: string };
  if (!response.ok) throw new Error(payload.message || payload.code || `Qwen TTS 请求失败（${response.status}）`);
  const audioUrlValue = payload.output?.audio?.url;
  if (!audioUrlValue) throw new Error("Qwen TTS 没有返回音频地址");
  const audioUrl = new URL(audioUrlValue);
  if (!(audioUrl.hostname === "aliyuncs.com" || audioUrl.hostname.endsWith(".aliyuncs.com"))) throw new Error("Qwen TTS 返回了不可信音频地址");
  audioUrl.protocol = "https:";
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) throw new Error(`无法下载 Qwen 音频（${audioResponse.status}）`);
  return { bytes: await audioResponse.arrayBuffer(), contentType: audioResponse.headers.get("content-type")?.split(";")[0] || "audio/wav" };
}

async function generateOpenAi(text: string, configuration: AccountTtsConfiguration): Promise<GeneratedAudio> {
  const response = await fetch(`${configuration.baseUrl.replace(/\/$/, "")}/audio/speech`, {
    method: "POST",
    headers: { authorization: `Bearer ${configuration.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: configuration.model, input: text, voice: configuration.voice, response_format: "wav", instructions: "Read clearly in natural British English for an IELTS listening exercise." }),
  });
  if (!response.ok) throw new Error(`OpenAI TTS 请求失败（${response.status}）：${(await response.text()).slice(0, 180)}`);
  return { bytes: await response.arrayBuffer(), contentType: "audio/wav" };
}

async function generateDeepgram(text: string, configuration: AccountTtsConfiguration): Promise<GeneratedAudio> {
  const model = `${configuration.model}-${configuration.voice}-en`;
  const response = await fetch(`${configuration.baseUrl.replace(/\/$/, "")}/speak?model=${encodeURIComponent(model)}`, {
    method: "POST",
    headers: { authorization: `Token ${configuration.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`Deepgram TTS 请求失败（${response.status}）：${(await response.text()).slice(0, 180)}`);
  return { bytes: await response.arrayBuffer(), contentType: response.headers.get("content-type")?.split(";")[0] || "audio/mpeg" };
}

async function cacheKey(text: string, provider: Provider, model: string, voice: string) {
  const input = `${CACHE_VERSION}\n${provider}\n${model}\n${voice}\n${text}`;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  return `${provider}/${model}/${voice}/${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}.audio`;
}

function audioResponse(body: BodyInit, contentType: string, source: "cache" | "generated", provider: Provider) {
  return new Response(body, { headers: { "content-type": contentType, "cache-control": "private, max-age=31536000, immutable", "x-tts-source": source, "x-tts-provider": provider } });
}

export async function POST(request: Request) {
  const account = await requireRequestAccount(request);
  if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { text?: unknown; model?: unknown; voice?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_TEXT_LENGTH) return NextResponse.json({ error: "TTS 文本为空或过长" }, { status: 400 });
  const stored = await getAccountTtsConfiguration(account.id);
  if (!stored || stored.provider === "browser") return NextResponse.json({ error: "当前使用浏览器语音", fallback: "browser" }, { status: 503 });
  const configuration = { ...stored, apiKey: stored.apiKey || runtimeKey(stored.provider), model: typeof body.model === "string" ? body.model : stored.model, voice: typeof body.voice === "string" ? body.voice : stored.voice };
  if (!configuration.apiKey) return NextResponse.json({ error: `${stored.provider} TTS API Key 尚未配置`, fallback: "browser" }, { status: 503 });
  const bucket = env.TTS_AUDIO;
  if (!bucket) return NextResponse.json({ error: "TTS 音频存储尚未配置", fallback: "browser" }, { status: 503 });
  const provider = stored.provider as Provider;
  const key = await cacheKey(text, provider, configuration.model, configuration.voice);
  const cached = await bucket.get(key);
  if (cached) return audioResponse(cached.body, cached.httpMetadata?.contentType || "audio/wav", "cache", provider);
  try {
    const audio = provider === "mimo" ? await generateMimo(text, configuration)
      : provider === "dashscope" ? await generateQwen(text, configuration)
      : provider === "openai" ? await generateOpenAi(text, configuration)
      : await generateDeepgram(text, configuration);
    await bucket.put(key, audio.bytes, { httpMetadata: { contentType: audio.contentType, cacheControl: "private, max-age=31536000, immutable" }, customMetadata: { provider, model: configuration.model, voice: configuration.voice, cacheVersion: CACHE_VERSION } });
    return audioResponse(audio.bytes, audio.contentType, "generated", provider);
  } catch (error) {
    console.error(`${provider} TTS generation failed`, error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "TTS 暂时不可用", fallback: "browser" }, { status: 502 });
  }
}
