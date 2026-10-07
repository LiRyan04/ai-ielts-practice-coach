import type { AccountAiConfiguration, AiProvider } from "../account";

export type ModelMessage = { role: "system" | "user" | "assistant"; content: string };
export type ModelRequest = { messages: ModelMessage[]; maxTokens?: number; temperature?: number; json?: boolean; signal?: AbortSignal };

export class AiConfigurationError extends Error {
  constructor(message = "文本模型接口尚未配置") { super(message); this.name = "AiConfigurationError"; }
}

const routedModelCache = new Map<string, string>();

function modelCacheKey(configuration: AccountAiConfiguration) {
  return `${configuration.baseUrl}\n${configuration.model}`;
}

function cachedConfiguration(configuration: AccountAiConfiguration) {
  const routedModel = routedModelCache.get(modelCacheKey(configuration));
  return routedModel ? { ...configuration, model: routedModel } : configuration;
}

export function providerLabel(provider: AiProvider) {
  return provider === "openai-responses" ? "OpenAI Responses"
    : provider === "anthropic" ? "Anthropic Messages"
    : provider === "bedrock" ? "Amazon Bedrock"
    : provider === "gemini" ? "Google Gemini"
    : "OpenAI Compatible";
}

function endpoint(baseUrl: string, suffix: string) {
  const base = baseUrl.replace(/\/+$/u, "");
  return base.endsWith(suffix) ? base : `${base}${suffix}`;
}

function compatibleHeaders(baseUrl: string, apiKey: string): Record<string, string> {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  return hostname === "xiaomimimo.com" || hostname.endsWith(".xiaomimimo.com")
    ? { "api-key": apiKey, "content-type": "application/json" }
    : { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
}

function splitMessages(messages: ModelMessage[]) {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const conversation = messages.filter((message) => message.role !== "system");
  return { system, conversation };
}

function requestDetails(configuration: AccountAiConfiguration, request: ModelRequest): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  const { provider, apiKey, baseUrl, model } = configuration;
  const { system, conversation } = splitMessages(request.messages);
  const maxTokens = request.maxTokens ?? 8_000;
  if (provider === "openai-responses") return {
    url: endpoint(baseUrl, "/responses"),
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: { model, input: conversation, ...(system ? { instructions: system } : {}), max_output_tokens: maxTokens, ...(request.temperature == null ? {} : { temperature: request.temperature }), ...(request.json ? { text: { format: { type: "json_object" } } } : {}) },
  };
  if (provider === "anthropic") return {
    url: endpoint(baseUrl, "/messages"),
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: { model, messages: conversation, ...(system ? { system } : {}), max_tokens: maxTokens, ...(request.temperature == null ? {} : { temperature: request.temperature }) },
  };
  if (provider === "gemini") return {
    url: `${baseUrl.replace(/\/+$/u, "")}/models/${encodeURIComponent(model)}:generateContent`,
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: { contents: conversation.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })), ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), generationConfig: { maxOutputTokens: maxTokens, ...(request.temperature == null ? {} : { temperature: request.temperature }), ...(request.json ? { responseMimeType: "application/json" } : {}) } },
  };
  if (provider === "bedrock") return {
    url: `${baseUrl.replace(/\/+$/u, "")}/model/${encodeURIComponent(model)}/converse`,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: { messages: conversation.map((message) => ({ role: message.role, content: [{ text: message.content }] })), ...(system ? { system: [{ text: system }] } : {}), inferenceConfig: { maxTokens, ...(request.temperature == null ? {} : { temperature: request.temperature }) } },
  };
  return {
    url: endpoint(baseUrl, "/chat/completions"),
    headers: compatibleHeaders(baseUrl, apiKey),
    body: { model, messages: request.messages, max_tokens: maxTokens, ...(request.temperature == null ? {} : { temperature: request.temperature }), ...(request.json ? { response_format: { type: "json_object" } } : {}) },
  };
}

function extractText(provider: AiProvider, payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as Record<string, unknown>;
  if (provider === "openai-responses") {
    if (typeof value.output_text === "string") return value.output_text;
    const output = Array.isArray(value.output) ? value.output : [];
    return output.flatMap((item) => item && typeof item === "object" && Array.isArray((item as Record<string, unknown>).content) ? (item as { content: unknown[] }).content : [])
      .map((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).text === "string" ? String((item as Record<string, unknown>).text) : "").join("");
  }
  if (provider === "anthropic") return (Array.isArray(value.content) ? value.content : []).map((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).text === "string" ? String((item as Record<string, unknown>).text) : "").join("");
  if (provider === "gemini") {
    const candidates = Array.isArray(value.candidates) ? value.candidates : [];
    return candidates.flatMap((candidate) => candidate && typeof candidate === "object" && (candidate as Record<string, unknown>).content && typeof (candidate as Record<string, unknown>).content === "object" && Array.isArray(((candidate as Record<string, unknown>).content as Record<string, unknown>).parts) ? (((candidate as Record<string, unknown>).content as Record<string, unknown>).parts as unknown[]) : [])
      .map((part) => part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string" ? String((part as Record<string, unknown>).text) : "").join("");
  }
  if (provider === "bedrock") {
    const output = value.output && typeof value.output === "object" ? value.output as Record<string, unknown> : {};
    const message = output.message && typeof output.message === "object" ? output.message as Record<string, unknown> : {};
    return (Array.isArray(message.content) ? message.content : []).map((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).text === "string" ? String((item as Record<string, unknown>).text) : "").join("");
  }
  const choices = Array.isArray(value.choices) ? value.choices : [];
  const choice = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
  const message = choice.message && typeof choice.message === "object" ? choice.message as Record<string, unknown> : {};
  return typeof message.content === "string" ? message.content : "";
}

async function responseError(response: Response) {
  const raw = await response.text();
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
    return typeof error.message === "string" ? error.message : typeof payload.message === "string" ? payload.message : raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

function compatibleRetryBody(body: Record<string, unknown>, detail: string) {
  const next = { ...body };
  let changed = false;
  if (/max_tokens|max token/iu.test(detail) && "max_tokens" in next) {
    next.max_completion_tokens = next.max_tokens;
    delete next.max_tokens;
    changed = true;
  }
  if (/temperature/iu.test(detail) && "temperature" in next) {
    delete next.temperature;
    changed = true;
  }
  if (/response_format|json_object/iu.test(detail) && "response_format" in next) {
    delete next.response_format;
    changed = true;
  }
  return changed ? next : null;
}

async function routedModelCandidates(configuration: AccountAiConfiguration) {
  try {
    const base = configuration.baseUrl.replace(/\/(?:chat\/completions|responses|models)\/?$/u, "").replace(/\/+$/u, "");
    const response = await fetch(`${base}/models`, { headers: compatibleHeaders(configuration.baseUrl, configuration.apiKey), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return [];
    const payload = await response.json() as { data?: Array<{ id?: unknown; owned_by?: unknown }> };
    return [...new Set((payload.data || []).filter((item) => item.id === configuration.model && typeof item.owned_by === "string" && item.owned_by).map((item) => `${item.owned_by}/${item.id}`))].slice(0, 6);
  } catch {
    return [];
  }
}

export async function requestModelText(configuration: AccountAiConfiguration, request: ModelRequest): Promise<string> {
  if (!configuration.apiKey) throw new AiConfigurationError();
  const details = requestDetails(cachedConfiguration(configuration), request);
  let body = details.body;
  let response = await fetch(details.url, { method: "POST", headers: details.headers, body: JSON.stringify(body), signal: request.signal });
  let raw = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { payload = null; }
  if (!response.ok && response.status === 400 && (configuration.provider === "openai-compatible" || configuration.provider === "openai-responses")) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const error = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : {};
    const detail = typeof error.message === "string" ? error.message : raw.slice(0, 300);
    const retryBody = compatibleRetryBody(body, detail);
    if (retryBody) {
      body = retryBody;
      response = await fetch(details.url, { method: "POST", headers: details.headers, body: JSON.stringify(body), signal: request.signal });
      raw = await response.text();
      try { payload = JSON.parse(raw); } catch { payload = null; }
    }
  }
  if (!response.ok) {
    const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const error = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : {};
    const detail = typeof error.message === "string" ? error.message : raw.slice(0, 300);
    if (response.status === 401 || response.status === 403) throw new AiConfigurationError(`${providerLabel(configuration.provider)} API Key 校验失败，请检查接口格式、地址和密钥。`);
    if (configuration.provider === "openai-compatible" && /unsupported model|model.+not supported|不支持.+模型/iu.test(detail)) {
      for (const routedModel of await routedModelCandidates(configuration)) {
        try {
          const content = await requestModelText({ ...configuration, model: routedModel }, request);
          routedModelCache.set(modelCacheKey(configuration), routedModel);
          return content;
        } catch { /* try the next routed owner */ }
      }
    }
    throw new Error(detail || `${providerLabel(configuration.provider)} 请求失败（${response.status}）`);
  }
  const content = extractText(configuration.provider, payload);
  if (!content) throw new Error(`${providerLabel(configuration.provider)} 未返回可读取的文本内容`);
  return content;
}

export async function requestModelResponse(configuration: AccountAiConfiguration, request: ModelRequest) {
  if (configuration.provider === "openai-compatible") {
    const details = requestDetails(cachedConfiguration(configuration), request);
    let body: Record<string, unknown> = { ...details.body, stream: true };
    let response = await fetch(details.url, { method: "POST", headers: details.headers, body: JSON.stringify(body), signal: request.signal });
    if (!response.ok) {
      const firstDetail = await responseError(response);
      const retryBody = response.status === 400 ? compatibleRetryBody(body, firstDetail) : null;
      if (retryBody) {
        body = retryBody;
        response = await fetch(details.url, { method: "POST", headers: details.headers, body: JSON.stringify(body), signal: request.signal });
      }
      if (!response.ok) {
        const detail = retryBody ? await responseError(response) : firstDetail;
        if (/unsupported model|model.+not supported|不支持.+模型/iu.test(detail)) {
          for (const routedModel of await routedModelCandidates(configuration)) {
            const routedBody = { ...body, model: routedModel };
            const routedResponse = await fetch(details.url, { method: "POST", headers: details.headers, body: JSON.stringify(routedBody), signal: request.signal });
            if (routedResponse.ok) {
              routedModelCache.set(modelCacheKey(configuration), routedModel);
              return routedResponse;
            }
          }
          try {
            const content = await requestModelText({ ...configuration, provider: "openai-responses" }, request);
            return Response.json({ choices: [{ message: { content } }] });
          } catch (responsesError) {
            const responsesDetail = responsesError instanceof Error ? responsesError.message : "Responses 接口请求失败";
            throw new Error(`${detail}；已自动尝试 OpenAI Responses，仍失败：${responsesDetail}`);
          }
        }
        throw new Error(detail || `${providerLabel(configuration.provider)} 请求失败（${response.status}）`);
      }
    }
    return response;
  }
  const content = await requestModelText(configuration, request);
  return Response.json({ choices: [{ message: { content } }] });
}
