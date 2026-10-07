import { env } from "cloudflare:workers";
import { ensureDatabase, getD1 } from "../db";

export type Account = {
  id: string;
  email: string;
  displayName: string;
};

export type AccountSettings = {
  targetBand: number;
  currentBand: number;
  examType: "academic" | "general";
  dailyMinutes: number;
  effectiveLearningMinutes: number;
  interfaceLanguage: "zh-CN" | "en";
  provider: AiProvider;
  baseUrl: string;
  model: string;
  ttsProvider: TtsProvider;
  ttsBaseUrl: string;
  ttsModel: string;
  ttsVoice: string;
  apiKeyConfigured: boolean;
  apiKeyLastFour: string | null;
  ttsApiKeyConfigured: boolean;
  ttsApiKeyLastFour: string | null;
};

export type AiProvider = "openai-compatible" | "openai-responses" | "anthropic" | "bedrock" | "gemini";
export type TtsProvider = "mimo" | "dashscope" | "openai" | "deepgram" | "browser";

export type AccountAiConfiguration = {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type AccountTtsConfiguration = {
  provider: TtsProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  voice: string;
};

type Identity = { email: string; displayName: string };

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-plus";
const DEFAULT_TTS_MODEL = "mimo-v2.5-tts";
const DEFAULT_TTS_VOICE = "Mia";
const DEFAULT_TTS_BASE_URL = "https://api.xiaomimimo.com/v1";

function validAiProvider(value: unknown): AiProvider {
  return value === "openai-responses" || value === "anthropic" || value === "bedrock" || value === "gemini" ? value : "openai-compatible";
}

function validTtsProvider(value: unknown): TtsProvider {
  return value === "dashscope" || value === "openai" || value === "deepgram" || value === "browser" ? value : "mimo";
}

export function identityFromHeaders(headers: Headers): Identity | null {
  const email = headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!email) {
    if (process.env.NODE_ENV !== "production") {
      return {
        email: (process.env.LOCAL_DEV_USER_EMAIL || "local@ai-ielts.test").trim().toLowerCase(),
        displayName: process.env.LOCAL_DEV_USER_NAME || "Local Learner",
      };
    }
    return null;
  }
  const encodedName = headers.get("oai-authenticated-user-full-name");
  let displayName = email;
  if (
    encodedName &&
    headers.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8"
  ) {
    try {
      displayName = decodeURIComponent(encodedName) || email;
    } catch {
      displayName = email;
    }
  }
  return { email, displayName };
}

export async function getOrCreateAccount(identity: Identity): Promise<Account> {
  await ensureDatabase();
  const database = getD1();
  const now = new Date().toISOString();
  const candidateId = crypto.randomUUID();
  await database
    .prepare("INSERT OR IGNORE INTO accounts (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .bind(candidateId, identity.email, identity.displayName, now, now)
    .run();
  const account = await database
    .prepare("SELECT id, email, display_name AS displayName FROM accounts WHERE email = ?")
    .bind(identity.email)
    .first<Account>();
  if (!account) throw new Error("无法创建账号");
  if (account.displayName !== identity.displayName) {
    await database.prepare("UPDATE accounts SET display_name = ?, updated_at = ? WHERE id = ?")
      .bind(identity.displayName, now, account.id).run();
    account.displayName = identity.displayName;
  }
  await database.prepare("INSERT OR IGNORE INTO learner_profiles (id, target_band, current_band, exam_type, daily_minutes, interface_language, created_at, updated_at) VALUES (?, 7, 5.5, 'academic', 60, 'zh-CN', ?, ?)")
    .bind(account.id, now, now).run();
  return account;
}

export async function requireRequestAccount(request: Request): Promise<Account | null> {
  const identity = identityFromHeaders(request.headers);
  return identity ? getOrCreateAccount(identity) : null;
}

export async function getAccountSettings(accountId: string): Promise<AccountSettings> {
  await ensureDatabase();
  const row = await getD1().prepare(`
    SELECT p.target_band AS targetBand, p.current_band AS currentBand,
      p.exam_type AS examType, p.daily_minutes AS dailyMinutes,
      p.effective_learning_minutes AS effectiveLearningMinutes,
      p.interface_language AS interfaceLanguage, s.provider, s.base_url AS baseUrl,
      s.model, s.tts_provider AS ttsProvider, s.tts_base_url AS ttsBaseUrl,
      s.tts_model AS ttsModel, s.tts_voice AS ttsVoice,
      s.encrypted_api_key AS encryptedApiKey, s.api_key_last_four AS apiKeyLastFour,
      s.tts_encrypted_api_key AS ttsEncryptedApiKey, s.tts_api_key_last_four AS ttsApiKeyLastFour
    FROM learner_profiles p LEFT JOIN api_settings s ON s.account_id = p.id WHERE p.id = ?
  `).bind(accountId).first<Record<string, unknown>>();
  return {
    targetBand: Number(row?.targetBand ?? 7),
    currentBand: Number(row?.currentBand ?? 5.5),
    examType: row?.examType === "general" ? "general" : "academic",
    dailyMinutes: Number(row?.dailyMinutes ?? 60),
    effectiveLearningMinutes: Number(row?.effectiveLearningMinutes ?? 15),
    interfaceLanguage: row?.interfaceLanguage === "en" ? "en" : "zh-CN",
    provider: validAiProvider(row?.provider),
    baseUrl: typeof row?.baseUrl === "string" ? row.baseUrl : DEFAULT_BASE_URL,
    model: typeof row?.model === "string" ? row.model : DEFAULT_MODEL,
    ttsProvider: validTtsProvider(row?.ttsProvider),
    ttsBaseUrl: typeof row?.ttsBaseUrl === "string" ? row.ttsBaseUrl : DEFAULT_TTS_BASE_URL,
    ttsModel: typeof row?.ttsModel === "string" ? row.ttsModel : DEFAULT_TTS_MODEL,
    ttsVoice: typeof row?.ttsVoice === "string" ? row.ttsVoice : DEFAULT_TTS_VOICE,
    apiKeyConfigured: typeof row?.encryptedApiKey === "string" && row.encryptedApiKey.length > 0,
    apiKeyLastFour: typeof row?.apiKeyLastFour === "string" ? row.apiKeyLastFour : null,
    ttsApiKeyConfigured: typeof row?.ttsEncryptedApiKey === "string" && row.ttsEncryptedApiKey.length > 0,
    ttsApiKeyLastFour: typeof row?.ttsApiKeyLastFour === "string" ? row.ttsApiKeyLastFour : null,
  };
}

export async function saveAccountSettings(accountId: string, input: {
  targetBand: number;
  dailyMinutes: number;
  effectiveLearningMinutes: number;
  examType: "academic" | "general";
  interfaceLanguage: "zh-CN" | "en";
  provider: AiProvider;
  baseUrl: string;
  model: string;
  ttsProvider: TtsProvider;
  ttsBaseUrl: string;
  ttsModel: string;
  ttsVoice: string;
  apiKey?: string;
  clearApiKey?: boolean;
  ttsApiKey?: string;
  clearTtsApiKey?: boolean;
}): Promise<void> {
  await ensureDatabase();
  const database = getD1();
  const now = new Date().toISOString();
  await database.prepare("UPDATE learner_profiles SET target_band = ?, daily_minutes = ?, effective_learning_minutes = ?, exam_type = ?, interface_language = ?, updated_at = ? WHERE id = ?")
    .bind(input.targetBand, input.dailyMinutes, input.effectiveLearningMinutes, input.examType, input.interfaceLanguage, now, accountId).run();

  const existing = await database.prepare("SELECT encrypted_api_key AS encryptedApiKey, api_key_last_four AS apiKeyLastFour, tts_encrypted_api_key AS ttsEncryptedApiKey, tts_api_key_last_four AS ttsApiKeyLastFour FROM api_settings WHERE account_id = ?")
    .bind(accountId).first<{ encryptedApiKey: string | null; apiKeyLastFour: string | null; ttsEncryptedApiKey: string | null; ttsApiKeyLastFour: string | null }>();
  let encryptedApiKey = existing?.encryptedApiKey ?? null;
  let apiKeyLastFour = existing?.apiKeyLastFour ?? null;
  if (input.clearApiKey) {
    encryptedApiKey = null;
    apiKeyLastFour = null;
  } else if (input.apiKey) {
    encryptedApiKey = await encryptSecret(input.apiKey);
    apiKeyLastFour = input.apiKey.slice(-4);
  }
  let ttsEncryptedApiKey = existing?.ttsEncryptedApiKey ?? null;
  let ttsApiKeyLastFour = existing?.ttsApiKeyLastFour ?? null;
  if (input.clearTtsApiKey) {
    ttsEncryptedApiKey = null;
    ttsApiKeyLastFour = null;
  } else if (input.ttsApiKey) {
    ttsEncryptedApiKey = await encryptSecret(input.ttsApiKey);
    ttsApiKeyLastFour = input.ttsApiKey.slice(-4);
  }
  await database.prepare(`
    INSERT INTO api_settings (account_id, provider, base_url, model, tts_provider, tts_base_url, tts_model, tts_voice, encrypted_api_key, api_key_last_four, tts_encrypted_api_key, tts_api_key_last_four, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET provider = excluded.provider, base_url = excluded.base_url, model = excluded.model,
      tts_provider = excluded.tts_provider, tts_base_url = excluded.tts_base_url, tts_model = excluded.tts_model, tts_voice = excluded.tts_voice,
      encrypted_api_key = excluded.encrypted_api_key, api_key_last_four = excluded.api_key_last_four,
      tts_encrypted_api_key = excluded.tts_encrypted_api_key, tts_api_key_last_four = excluded.tts_api_key_last_four,
      updated_at = excluded.updated_at
  `).bind(accountId, input.provider, input.baseUrl, input.model, input.ttsProvider, input.ttsBaseUrl, input.ttsModel, input.ttsVoice, encryptedApiKey, apiKeyLastFour, ttsEncryptedApiKey, ttsApiKeyLastFour, now).run();
}

export async function getAccountTtsConfiguration(accountId: string): Promise<AccountTtsConfiguration | null> {
  await ensureDatabase();
  const row = await getD1().prepare("SELECT tts_provider AS provider, tts_base_url AS baseUrl, tts_model AS model, tts_voice AS voice, tts_encrypted_api_key AS encryptedApiKey FROM api_settings WHERE account_id = ?")
    .bind(accountId).first<{ provider: TtsProvider; baseUrl: string; model: string; voice: string; encryptedApiKey: string | null }>();
  if (!row) return null;
  return { provider: validTtsProvider(row.provider), apiKey: row.encryptedApiKey ? await decryptSecret(row.encryptedApiKey) : "", baseUrl: row.baseUrl, model: row.model, voice: row.voice };
}

export async function getAccountAiConfiguration(accountId: string): Promise<AccountAiConfiguration | null> {
  await ensureDatabase();
  const row = await getD1().prepare("SELECT provider, base_url AS baseUrl, model, encrypted_api_key AS encryptedApiKey FROM api_settings WHERE account_id = ?")
    .bind(accountId).first<{ provider: AiProvider; baseUrl: string; model: string; encryptedApiKey: string | null }>();
  if (!row?.encryptedApiKey) return null;
  return { provider: validAiProvider(row.provider), apiKey: await decryptSecret(row.encryptedApiKey), baseUrl: row.baseUrl, model: row.model };
}

function runtimeSecret(): string {
  const workerValue = (env as unknown as Record<string, unknown>).ACCOUNT_DATA_ENCRYPTION_KEY;
  const value = typeof workerValue === "string" ? workerValue : process.env.ACCOUNT_DATA_ENCRYPTION_KEY;
  if (!value || value.length < 24) throw new Error("账号加密密钥尚未配置，请联系站点管理员");
  return value;
}

async function encryptionKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(runtimeSecret()));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptSecret(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value)));
  return `${toBase64(iv)}.${toBase64(encrypted)}`;
}

async function decryptSecret(value: string): Promise<string> {
  const [ivValue, encryptedValue] = value.split(".");
  if (!ivValue || !encryptedValue) throw new Error("账号中的 API Key 数据无效");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivValue) }, await encryptionKey(), fromBase64(encryptedValue));
  return new TextDecoder().decode(decrypted);
}

function toBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const decoded = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) decoded[index] = binary.charCodeAt(index);
  return decoded;
}
