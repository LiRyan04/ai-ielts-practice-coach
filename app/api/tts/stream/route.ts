import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getAccountTtsConfiguration, requireRequestAccount, type AccountTtsConfiguration, type TtsProvider } from "../../../../lib/account";

const CACHE_VERSION = "v4";
const SAMPLE_RATE = 24_000;
const MAX_TEXT_LENGTH = 12_000;
type Provider = Exclude<TtsProvider, "browser">;
type InputSegment = { speaker: string; text: string };
type SynthesisSegment = InputSegment & { voice: string };

const PROVIDER_VOICES: Record<Provider, { female: string[]; male: string[]; all: string[] }> = {
  mimo: { female: ["Mia", "Chloe"], male: ["Milo", "Dean"], all: ["Mia", "Milo", "Chloe", "Dean"] },
  dashscope: { female: ["Cherry", "Serena", "Chelsie"], male: ["Ethan"], all: ["Cherry", "Ethan", "Serena", "Chelsie"] },
  openai: { female: ["marin", "coral", "nova"], male: ["cedar", "alloy", "onyx"], all: ["marin", "cedar", "coral", "alloy", "nova", "onyx"] },
  deepgram: { female: ["thalia", "athena"], male: ["apollo", "orion"], all: ["thalia", "apollo", "athena", "orion"] },
};

function runtimeKey(provider: TtsProvider) {
  const names: Partial<Record<TtsProvider, string>> = { mimo: "MIMO_API_KEY", dashscope: "DASHSCOPE_API_KEY", openai: "OPENAI_API_KEY", deepgram: "DEEPGRAM_API_KEY" };
  const name = names[provider];
  if (!name) return "";
  const workerValue = (env as unknown as Record<string, unknown>)[name];
  return (typeof workerValue === "string" ? workerValue : process.env[name] || "").trim();
}

async function ttsCacheKey(text: string, provider: Provider, model: string, voice: string) {
  const input = `${CACHE_VERSION}\n${provider}\n${model}\n${voice}\n${text}`;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  return `${provider}/${model}/${voice}/${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}.audio`;
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeBase64(value: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < value.length; offset += 0x8000) binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function pcmToWave(chunks: Uint8Array[]) {
  const pcmLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const wave = new Uint8Array(44 + pcmLength);
  const view = new DataView(wave.buffer);
  const write = (offset: number, text: string) => Array.from(text).forEach((character, index) => wave[offset + index] = character.charCodeAt(0));
  write(0, "RIFF"); view.setUint32(4, 36 + pcmLength, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, pcmLength, true);
  let offset = 44;
  for (const chunk of chunks) { wave.set(chunk, offset); offset += chunk.byteLength; }
  return wave.buffer;
}

function qwenEndpoint(baseUrl: string) {
  const hostname = new URL(baseUrl).hostname;
  const regionalHost = hostname.includes("intl") ? "dashscope-intl.aliyuncs.com" : hostname.includes("us") ? "dashscope-us.aliyuncs.com" : "dashscope.aliyuncs.com";
  return `https://${regionalHost}/api/v1/services/aigc/multimodal-generation/generation`;
}

function assignSegmentVoices(segments: InputSegment[], provider: Provider, defaultVoice: string): SynthesisSegment[] {
  const voices = PROVIDER_VOICES[provider];
  const assignments = new Map<string, string>();
  const usedVoices = new Set<string>();
  let femaleIndex = 0;
  let maleIndex = 0;
  let neutralIndex = 0;
  const voiceFor = (speaker: string) => {
    const existing = assignments.get(speaker);
    if (existing) return existing;
    const normalized = speaker.toLowerCase();
    const female = /woman|female|girl|mother|wife|mrs|miss|ms\.?/u.test(normalized);
    const male = /(^|[ -])man($|[ -])|male|boy|father|husband|mr\.?/u.test(normalized);
    const pool = female ? voices.female : male ? voices.male : voices.all;
    const index = female ? femaleIndex++ : male ? maleIndex++ : neutralIndex++;
    const preferred = pool[index % pool.length] || defaultVoice;
    // Never cross the inferred gender boundary just to make every speaker
    // unique. Once a gender-specific pool is exhausted, reusing a matching
    // voice is much less surprising than assigning (for example) MAN a female
    // voice.
    const selected = speaker === "NARRATOR" ? defaultVoice
      : !usedVoices.has(preferred) ? preferred
      : pool.find((candidate) => !usedVoices.has(candidate)) || preferred;
    assignments.set(speaker, selected);
    usedVoices.add(selected);
    return selected;
  };
  return segments.map((segment) => ({ ...segment, voice: voiceFor(segment.speaker) }));
}

function silenceChunk(milliseconds = 220) {
  return new Uint8Array(Math.round(SAMPLE_RATE * 2 * milliseconds / 1_000));
}

async function upstreamError(response: Response) {
  const detail = (await response.text()).slice(0, 300);
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string }; message?: string };
    return parsed.error?.message || parsed.message || detail;
  } catch {
    return detail;
  }
}

function mimoModelId(baseUrl: string, model: string) {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  return hostname === "api.llm.mioffice.cn" && !model.includes("/") ? `xiaomi/${model}` : model;
}

async function upstreamRequest(text: string, configuration: AccountTtsConfiguration) {
  const { provider, baseUrl, model, voice, apiKey } = configuration;
  if (provider === "mimo") return fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST", headers: { "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ model: mimoModelId(baseUrl, model), messages: [{ role: "assistant", content: text }], audio: { format: "pcm16", voice }, stream: true }),
  });
  if (provider === "dashscope") return fetch(qwenEndpoint(baseUrl), {
    method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "x-dashscope-sse": "enable" },
    body: JSON.stringify({ model, input: { text, voice, language_type: "English" } }),
  });
  if (provider === "openai") return fetch(`${baseUrl.replace(/\/$/, "")}/audio/speech`, {
    method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, input: text, voice, response_format: "pcm", instructions: "Read clearly in natural British English for an IELTS listening exercise." }),
  });
  const deepgramModel = `${model}-${voice}-en`;
  return fetch(`${baseUrl.replace(/\/$/, "")}/speak?model=${encodeURIComponent(deepgramModel)}&encoding=linear16&sample_rate=${SAMPLE_RATE}&container=none`, {
    method: "POST", headers: { authorization: `Token ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ text }),
  });
}

export async function POST(request: Request) {
  const account = await requireRequestAccount(request);
  if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const payload = await request.json().catch(() => ({})) as { text?: unknown; segments?: unknown; model?: unknown; voice?: unknown };
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text || text.length > MAX_TEXT_LENGTH) return NextResponse.json({ error: "TTS 文本为空或过长" }, { status: 400 });
  const requestedSegments: InputSegment[] = Array.isArray(payload.segments) ? payload.segments.slice(0, 100).map((item) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { speaker: typeof value.speaker === "string" ? value.speaker.trim().slice(0, 80) || "NARRATOR" : "NARRATOR", text: typeof value.text === "string" ? value.text.trim() : "" };
  }).filter((segment) => segment.text) : [];
  const stored = await getAccountTtsConfiguration(account.id);
  if (!stored || stored.provider === "browser") return NextResponse.json({ error: "当前使用浏览器语音" }, { status: 503 });
  const configuration: AccountTtsConfiguration = { ...stored, apiKey: stored.apiKey || runtimeKey(stored.provider), model: typeof payload.model === "string" ? payload.model : stored.model, voice: typeof payload.voice === "string" ? payload.voice : stored.voice };
  if (!configuration.apiKey) return NextResponse.json({ error: `${configuration.provider} TTS API Key 尚未配置` }, { status: 503 });
  const provider = configuration.provider as Provider;
  const synthesisSegments = assignSegmentVoices(requestedSegments.length ? requestedSegments : [{ speaker: "NARRATOR", text }], provider, configuration.voice);
  if (synthesisSegments.reduce((sum, segment) => sum + segment.text.length, 0) > MAX_TEXT_LENGTH) return NextResponse.json({ error: "TTS 文本过长" }, { status: 400 });
  const bucket = env.TTS_AUDIO;
  if (!bucket) return NextResponse.json({ error: "TTS 音频存储尚未配置" }, { status: 503 });
  const key = await ttsCacheKey(JSON.stringify(synthesisSegments), provider, configuration.model, configuration.voice);
  const cached = await bucket.get(key);
  if (cached) return new Response(cached.body, { headers: { "content-type": cached.httpMetadata?.contentType || "audio/wav", "x-tts-provider": provider, "x-tts-source": "cache" } });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const pcmChunks: Uint8Array[] = [];
      try {
        for (let segmentIndex = 0; segmentIndex < synthesisSegments.length; segmentIndex += 1) {
          const segment = synthesisSegments[segmentIndex];
          const upstream = await upstreamRequest(segment.text, { ...configuration, voice: segment.voice });
          if (!upstream.ok || !upstream.body) throw new Error(await upstreamError(upstream) || `${provider} 流式 TTS 请求失败（${upstream.status}）`);
          const reader = upstream.body.getReader();
          let segmentChunkCount = 0;
          try {
            if (provider === "openai" || provider === "deepgram") {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                segmentChunkCount += 1;
                pcmChunks.push(value);
                controller.enqueue(encoder.encode(`${JSON.stringify({ type: "audio", data: encodeBase64(value) })}\n`));
              }
            } else {
              const decoder = new TextDecoder();
              let pending = "";
              const processEvent = (event: string) => {
                const data = event.split(/\r?\n/u).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
                if (!data || data === "[DONE]") return;
                const chunk = JSON.parse(data) as { output?: { audio?: { data?: string } }; choices?: Array<{ delta?: { audio?: { data?: string } } }>; code?: string; message?: string; error?: { message?: string } };
                const audioData = provider === "mimo" ? chunk.choices?.[0]?.delta?.audio?.data : chunk.output?.audio?.data;
                if (audioData) {
                  segmentChunkCount += 1;
                  pcmChunks.push(decodeBase64(audioData));
                  controller.enqueue(encoder.encode(`${JSON.stringify({ type: "audio", data: audioData })}\n`));
                } else if (chunk.code || chunk.error) throw new Error(chunk.error?.message || chunk.message || chunk.code);
              };
              while (true) {
                const { done, value } = await reader.read();
                pending += decoder.decode(value, { stream: !done });
                const events = pending.split(/\r?\n\r?\n/u);
                pending = events.pop() || "";
                for (const event of events) processEvent(event);
                if (done) {
                  if (pending.trim()) processEvent(pending);
                  break;
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
          if (!segmentChunkCount) throw new Error(`${segment.speaker} 没有返回音频数据`);
          if (segmentIndex < synthesisSegments.length - 1) {
            const silence = silenceChunk();
            pcmChunks.push(silence);
            controller.enqueue(encoder.encode(`${JSON.stringify({ type: "audio", data: encodeBase64(silence) })}\n`));
          }
        }
        if (!pcmChunks.length) throw new Error(`${provider} 没有返回流式音频数据`);
        const wave = pcmToWave(pcmChunks);
        await bucket.put(key, wave, { httpMetadata: { contentType: "audio/wav", cacheControl: "private, max-age=31536000, immutable" }, customMetadata: { provider, model: configuration.model, voice: configuration.voice, cacheVersion: CACHE_VERSION } });
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "done", sampleRate: SAMPLE_RATE })}\n`));
        controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "流式合成失败" })}\n`));
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-tts-provider": provider, "x-audio-sample-rate": String(SAMPLE_RATE) } });
}
