"use client";

import { useState } from "react";
import type { Account, AccountSettings, AiProvider, TtsProvider } from "../../lib/account";

const AI_PRESETS: Record<AiProvider, { label: string; baseUrl: string; model: string; models: string[] }> = {
  "openai-compatible": { label: "OpenAI Compatible", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini", models: ["gpt-5-mini", "gpt-5", "qwen-plus", "deepseek-chat"] },
  "openai-responses": { label: "OpenAI Responses", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini", models: ["gpt-5-mini", "gpt-5"] },
  anthropic: { label: "Anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-20250514", models: ["claude-sonnet-4-20250514"] },
  bedrock: { label: "Amazon Bedrock", baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com", model: "anthropic.claude-sonnet-4-20250514-v1:0", models: ["anthropic.claude-sonnet-4-20250514-v1:0"] },
  gemini: { label: "Google (Gemini)", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", models: ["gemini-2.5-flash", "gemini-2.5-pro"] },
};

const PROVIDER_PRESETS = {
  openai: { label: "OpenAI", format: "openai-responses", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini", models: ["gpt-5-mini", "gpt-5"] },
  dashscope: { label: "Alibaba Cloud · Qwen", format: "openai-compatible", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", models: ["qwen-plus", "qwen-max"] },
  deepseek: { label: "DeepSeek", format: "openai-compatible", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", models: ["deepseek-chat", "deepseek-reasoner"] },
  mimo: { label: "Xiaomi MiMo", format: "openai-compatible", baseUrl: "https://api.xiaomimimo.com/v1", model: "mimo-v2.5", models: ["mimo-v2.5", "mimo-v2.5-pro"] },
  kimi: { label: "Moonshot · Kimi", format: "openai-compatible", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k3", models: ["kimi-k3", "kimi-k2.5"] },
  anthropic: { label: "Anthropic", format: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-20250514", models: ["claude-sonnet-4-20250514"] },
  gemini: { label: "Google Gemini", format: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", models: ["gemini-2.5-flash", "gemini-2.5-pro"] },
  bedrock: { label: "Amazon Bedrock", format: "bedrock", baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com", model: "anthropic.claude-sonnet-4-20250514-v1:0", models: ["anthropic.claude-sonnet-4-20250514-v1:0"] },
} as const;

type ProviderPresetId = keyof typeof PROVIDER_PRESETS | "custom";

function matchingProviderPreset(settings: AccountSettings): ProviderPresetId {
  const hostname = (() => { try { return new URL(settings.baseUrl).hostname; } catch { return ""; } })();
  return (Object.entries(PROVIDER_PRESETS).find(([, preset]) => new URL(preset.baseUrl).hostname === hostname)?.[0] as ProviderPresetId | undefined) || "custom";
}

const TTS_PRESETS: Record<TtsProvider, { label: string; baseUrl: string; model: string; voice: string; models: string[]; voices: Array<[string, string]> }> = {
  mimo: { label: "Xiaomi MiMo", baseUrl: "https://api.xiaomimimo.com/v1", model: "mimo-v2.5-tts", voice: "Mia", models: ["mimo-v2.5-tts"], voices: [["Mia", "Mia · 女声"], ["Chloe", "Chloe · 女声"], ["Milo", "Milo · 男声"], ["Dean", "Dean · 男声"]] },
  dashscope: { label: "Alibaba Cloud · Qwen", baseUrl: "https://dashscope.aliyuncs.com", model: "qwen3-tts-flash", voice: "Cherry", models: ["qwen3-tts-flash", "qwen3-tts-instruct-flash"], voices: [["Cherry", "Cherry · 女声"], ["Serena", "Serena · 女声"], ["Ethan", "Ethan · 男声"], ["Chelsie", "Chelsie · 女声"]] },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini-tts", voice: "marin", models: ["gpt-4o-mini-tts"], voices: [["marin", "Marin · 推荐"], ["cedar", "Cedar · 推荐"], ["coral", "Coral"], ["alloy", "Alloy"], ["nova", "Nova"], ["onyx", "Onyx"]] },
  deepgram: { label: "Deepgram", baseUrl: "https://api.deepgram.com/v1", model: "aura-2", voice: "thalia", models: ["aura-2"], voices: [["thalia", "Thalia · 女声"], ["apollo", "Apollo · 男声"], ["athena", "Athena · 女声"], ["orion", "Orion · 男声"]] },
  browser: { label: "浏览器内置语音", baseUrl: "", model: "browser", voice: "default", models: ["browser"], voices: [["default", "系统默认英文音色"]] },
};

export function SettingsForm({ account, initialSettings }: { account: Account; initialSettings: AccountSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [providerPreset, setProviderPreset] = useState<ProviderPresetId>(() => matchingProviderPreset(initialSettings));
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [ttsApiKey, setTtsApiKey] = useState("");
  const [showTtsApiKey, setShowTtsApiKey] = useState(false);
  const [clearTtsApiKey, setClearTtsApiKey] = useState(false);
  const [savedAiProvider, setSavedAiProvider] = useState(initialSettings.provider);
  const [savedTtsProvider, setSavedTtsProvider] = useState(initialSettings.ttsProvider);
  const [profileState, setProfileState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [profileMessage, setProfileMessage] = useState("");
  const [modelSettingsState, setModelSettingsState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [modelSettingsMessage, setModelSettingsMessage] = useState("");
  const [modelOptions, setModelOptions] = useState(AI_PRESETS[initialSettings.provider].models);
  const [modelListState, setModelListState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [modelListMessage, setModelListMessage] = useState("");
  const [ttsModelOptions, setTtsModelOptions] = useState(TTS_PRESETS[initialSettings.ttsProvider].models);
  const [ttsModelListState, setTtsModelListState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [ttsModelListMessage, setTtsModelListMessage] = useState("");
  const aiProviderChanged = settings.provider !== savedAiProvider;
  const ttsProviderChanged = settings.ttsProvider !== savedTtsProvider;

  async function fetchModels() {
    setModelListState("loading");
    setModelListMessage("");
    try {
      const response = await fetch("/api/account/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: settings.provider, baseUrl: settings.baseUrl, apiKey }),
      });
      const payload = await response.json() as { models?: string[]; error?: string };
      if (!response.ok || !payload.models?.length) throw new Error(payload.error || "获取模型列表失败");
      setModelOptions(payload.models);
      setModelListState("success");
      setModelListMessage(`已获取 ${payload.models.length} 个模型`);
    } catch (error) {
      setModelListState("error");
      setModelListMessage(error instanceof Error ? error.message : "获取模型列表失败");
    }
  }

  async function fetchTtsModels() {
    setTtsModelListState("loading");
    setTtsModelListMessage("");
    try {
      const response = await fetch("/api/account/models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "tts", provider: settings.ttsProvider, baseUrl: settings.ttsBaseUrl, apiKey: ttsApiKey }),
      });
      const payload = await response.json() as { models?: string[]; error?: string };
      if (!response.ok || !payload.models?.length) throw new Error(payload.error || "获取 TTS 模型列表失败");
      setTtsModelOptions(payload.models);
      setTtsModelListState("success");
      setTtsModelListMessage(`已获取 ${payload.models.length} 个 TTS 模型`);
    } catch (error) {
      setTtsModelListState("error");
      setTtsModelListMessage(error instanceof Error ? error.message : "获取 TTS 模型列表失败");
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileState("saving");
    setProfileMessage("");
    try {
      const response = await fetch("/api/account/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section: "profile", targetBand: settings.targetBand, dailyMinutes: settings.dailyMinutes, effectiveLearningMinutes: settings.effectiveLearningMinutes, examType: settings.examType, interfaceLanguage: settings.interfaceLanguage }),
      });
      const payload = await response.json() as { settings?: AccountSettings; error?: string };
      if (!response.ok || !payload.settings) throw new Error(payload.error || "保存失败");
      setProfileState("saved");
      setProfileMessage("账号资料已保存");
    } catch (error) {
      setProfileState("error");
      setProfileMessage(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function saveModelSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModelSettingsState("saving");
    setModelSettingsMessage("");
    try {
      const response = await fetch("/api/account/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section: "models", ...settings, apiKey, clearApiKey: clearApiKey || (aiProviderChanged && !apiKey), ttsApiKey, clearTtsApiKey: clearTtsApiKey || (ttsProviderChanged && !ttsApiKey) }),
      });
      const payload = await response.json() as { settings?: AccountSettings; error?: string };
      if (!response.ok || !payload.settings) throw new Error(payload.error || "保存失败");
      setSettings((current) => ({ ...current, provider: payload.settings!.provider, baseUrl: payload.settings!.baseUrl, model: payload.settings!.model, ttsProvider: payload.settings!.ttsProvider, ttsBaseUrl: payload.settings!.ttsBaseUrl, ttsModel: payload.settings!.ttsModel, ttsVoice: payload.settings!.ttsVoice, apiKeyConfigured: payload.settings!.apiKeyConfigured, apiKeyLastFour: payload.settings!.apiKeyLastFour, ttsApiKeyConfigured: payload.settings!.ttsApiKeyConfigured, ttsApiKeyLastFour: payload.settings!.ttsApiKeyLastFour }));
      setApiKey("");
      setClearApiKey(false);
      setTtsApiKey("");
      setClearTtsApiKey(false);
      setSavedAiProvider(payload.settings.provider);
      setSavedTtsProvider(payload.settings.ttsProvider);
      setModelSettingsState("saved");
      setModelSettingsMessage("模型设置已保存");
    } catch (error) {
      setModelSettingsState("error");
      setModelSettingsMessage(error instanceof Error ? error.message : "保存失败");
    }
  }

  return (
    <div className="settings-grid">
      <form className="card settings-card" onSubmit={saveProfile}>
        <p className="eyebrow">ACCOUNT</p><h2>账号资料</h2>
        <div className="account-profile">
          <span className="account-avatar large" aria-hidden="true">{account.displayName.trim().slice(0, 1).toUpperCase()}</span>
          <span><strong>{account.displayName}</strong><small>{account.email}</small></span>
        </div>
        <div className="settings-divider" />
        <p className="eyebrow">LEARNING</p><h2>学习偏好</h2>
        <label className="field"><span>目标总分</span><select value={settings.targetBand} onChange={(event) => setSettings({ ...settings, targetBand: Number(event.target.value) })}>{Array.from({ length: 11 }, (_, index) => 4 + index * .5).map((band) => <option key={band} value={band}>{band.toFixed(1)}</option>)}</select></label>
        <label className="field"><span>默认每日时长</span><div className="input-suffix"><input type="number" min="10" max="360" step="5" value={settings.dailyMinutes} onChange={(event) => setSettings({ ...settings, dailyMinutes: Number(event.target.value) })} /><small>分钟</small></div></label>
        <label className="field"><span>有效学习时间</span><div className="input-suffix"><input type="number" min="1" max="180" step="1" value={settings.effectiveLearningMinutes} onChange={(event) => setSettings({ ...settings, effectiveLearningMinutes: Number(event.target.value) })} /><small>分钟</small></div></label>
        <label className="field"><span>考试类型</span><select value={settings.examType} onChange={(event) => setSettings({ ...settings, examType: event.target.value === "general" ? "general" : "academic" })}><option value="academic">Academic</option><option value="general">General Training</option></select></label>
        <label className="field"><span>界面语言</span><select value={settings.interfaceLanguage} onChange={(event) => setSettings({ ...settings, interfaceLanguage: event.target.value === "en" ? "en" : "zh-CN" })}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
        <div className="settings-actions"><button className="button button-primary" type="submit" disabled={profileState === "saving"}>{profileState === "saving" ? "正在保存…" : "保存账号资料"}</button><span className={profileState === "error" ? "save-message error" : "save-message"} aria-live="polite">{profileMessage}</span></div>
      </form>

      <form className="card settings-card" onSubmit={saveModelSettings}>
        <p className="eyebrow">MODEL API</p><h2>文本与评分模型</h2>
        <div className={settings.apiKeyConfigured && !clearApiKey && !aiProviderChanged ? "config-status ready" : "config-status"}><i />{settings.apiKeyConfigured && !clearApiKey && !aiProviderChanged ? `已配置 · 尾号 ${settings.apiKeyLastFour}` : "当前接口格式尚未配置 API Key"}</div>
        <label className="field"><span>服务商预设</span><select value={providerPreset} onChange={(event) => { const selected = event.target.value as ProviderPresetId; setProviderPreset(selected); if (selected === "custom") return; const preset = PROVIDER_PRESETS[selected]; setSettings({ ...settings, provider: preset.format, baseUrl: preset.baseUrl, model: preset.model }); setModelOptions([...preset.models]); setModelListState("idle"); setModelListMessage(""); }}><option value="custom">自定义配置</option>{Object.entries(PROVIDER_PRESETS).map(([id, preset]) => <option key={id} value={id}>{preset.label}</option>)}</select></label>
        <label className="field"><span>接口格式</span><select value={settings.provider} onChange={(event) => { const provider = event.target.value as AiProvider; const preset = AI_PRESETS[provider]; setProviderPreset("custom"); setSettings({ ...settings, provider, baseUrl: preset.baseUrl, model: preset.model }); setModelOptions(preset.models); setModelListState("idle"); setModelListMessage(""); }}><option value="openai-compatible">OpenAI Compatible</option><option value="openai-responses">OpenAI Responses</option><option value="anthropic">Anthropic</option><option value="bedrock">Amazon Bedrock</option><option value="gemini">Google (Gemini)</option></select></label>
        <label className="field"><span>API Base URL</span><input type="url" required value={settings.baseUrl} onChange={(event) => setSettings({ ...settings, baseUrl: event.target.value })} /></label>
        <div className="field"><span>模型</span><div className="model-field-control"><input aria-label="模型" list="ai-model-options" type="text" required maxLength={100} placeholder="输入或选择模型" value={settings.model} onChange={(event) => setSettings({ ...settings, model: event.target.value })} /><button className="button button-secondary" type="button" disabled={modelListState === "loading" || !settings.baseUrl || clearApiKey} onClick={() => void fetchModels()}>{modelListState === "loading" ? "正在获取…" : "获取模型列表"}</button></div><datalist id="ai-model-options">{modelOptions.map((model) => <option key={model} value={model} />)}</datalist><div className={modelListState === "error" ? "save-message error" : "save-message"} aria-live="polite">{modelListMessage}</div></div>
        <div className="field"><span>{settings.apiKeyConfigured && !aiProviderChanged ? "替换 API Key（留空则保留）" : "API Key"}</span><div className="secret-input"><input aria-label="API Key" type={showApiKey ? "text" : "password"} autoComplete="off" value={apiKey} disabled={clearApiKey} placeholder={settings.apiKeyConfigured && !aiProviderChanged ? "••••••••••••" : "sk-..."} onChange={(event) => setApiKey(event.target.value)} /><button aria-label={showApiKey ? "隐藏 API Key" : "显示 API Key"} aria-pressed={showApiKey} title={showApiKey ? "隐藏 API Key" : "显示 API Key"} type="button" disabled={clearApiKey} onClick={() => setShowApiKey((visible) => !visible)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.8" />{showApiKey && <path d="m4 4 16 16" />}</svg></button></div></div>
        {settings.apiKeyConfigured && <label className="check-field"><input type="checkbox" checked={clearApiKey} onChange={(event) => { setClearApiKey(event.target.checked); if (event.target.checked) setApiKey(""); }} /><span>移除当前 API Key</span></label>}
        <div className="settings-divider" />
        <p className="eyebrow">TEXT TO SPEECH</p><h2>听力合成语音</h2>
        <p>TTS 使用独立连接，可与上方文本模型选择不同提供商。生成缓存按提供商、模型和音色隔离。</p>
        <label className="field"><span>TTS 提供商</span><select data-testid="tts-provider-select" value={settings.ttsProvider} onChange={(event) => { const ttsProvider = event.target.value as TtsProvider; const preset = TTS_PRESETS[ttsProvider]; setSettings({ ...settings, ttsProvider, ttsBaseUrl: preset.baseUrl, ttsModel: preset.model, ttsVoice: preset.voice }); setTtsModelOptions(preset.models); setTtsModelListState("idle"); setTtsModelListMessage(""); }}><option value="mimo">Xiaomi MiMo</option><option value="dashscope">Alibaba Cloud · Qwen</option><option value="openai">OpenAI</option><option value="deepgram">Deepgram</option><option value="browser">浏览器内置语音</option></select></label>
        {settings.ttsProvider !== "browser" && <label className="field"><span>TTS API Base URL</span><input type="url" required value={settings.ttsBaseUrl} onChange={(event) => setSettings({ ...settings, ttsBaseUrl: event.target.value })} /></label>}
        <div className="field"><span>TTS 模型</span><div className="model-field-control"><input aria-label="TTS 模型" data-testid="tts-model-select" list="tts-model-options" type="text" required maxLength={100} placeholder="输入或选择 TTS 模型" value={settings.ttsModel} onChange={(event) => setSettings({ ...settings, ttsModel: event.target.value })} /><button className="button button-secondary" type="button" disabled={settings.ttsProvider === "browser" || ttsModelListState === "loading" || !settings.ttsBaseUrl || clearTtsApiKey} onClick={() => void fetchTtsModels()}>{ttsModelListState === "loading" ? "正在获取…" : "获取模型列表"}</button></div><datalist id="tts-model-options">{ttsModelOptions.map((model) => <option key={model} value={model} />)}</datalist><div className={ttsModelListState === "error" ? "save-message error" : "save-message"} aria-live="polite">{ttsModelListMessage}</div></div>
        <label className="field"><span>默认 / 旁白音色</span><select data-testid="tts-voice-select" value={settings.ttsVoice} onChange={(event) => setSettings({ ...settings, ttsVoice: event.target.value })}>{TTS_PRESETS[settings.ttsProvider].voices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><small>单人独白、旁白和无法识别人物时使用；多人对话中的其他角色会自动分配不同音色。</small></label>
        {settings.ttsProvider !== "browser" && <><div className={settings.ttsApiKeyConfigured && !clearTtsApiKey && !ttsProviderChanged ? "config-status ready" : "config-status"}><i />{settings.ttsApiKeyConfigured && !clearTtsApiKey && !ttsProviderChanged ? `TTS Key 已配置 · 尾号 ${settings.ttsApiKeyLastFour}` : "当前 TTS 提供商尚未配置 API Key"}</div><div className="field"><span>{settings.ttsApiKeyConfigured && !ttsProviderChanged ? "替换 TTS API Key（留空则保留）" : "TTS API Key"}</span><div className="secret-input"><input aria-label="TTS API Key" type={showTtsApiKey ? "text" : "password"} autoComplete="off" value={ttsApiKey} disabled={clearTtsApiKey} placeholder={`${TTS_PRESETS[settings.ttsProvider].label} API Key`} onChange={(event) => setTtsApiKey(event.target.value)} /><button aria-label={showTtsApiKey ? "隐藏 TTS API Key" : "显示 TTS API Key"} aria-pressed={showTtsApiKey} title={showTtsApiKey ? "隐藏 TTS API Key" : "显示 TTS API Key"} type="button" disabled={clearTtsApiKey} onClick={() => setShowTtsApiKey((visible) => !visible)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.8" />{showTtsApiKey && <path d="m4 4 16 16" />}</svg></button></div></div>{settings.ttsApiKeyConfigured && !ttsProviderChanged && <label className="check-field"><input type="checkbox" checked={clearTtsApiKey} onChange={(event) => { setClearTtsApiKey(event.target.checked); if (event.target.checked) setTtsApiKey(""); }} /><span>移除当前 TTS API Key</span></label>}</>}
        <div className="settings-actions"><button className="button button-primary" type="submit" disabled={modelSettingsState === "saving"}>{modelSettingsState === "saving" ? "正在保存…" : "保存模型设置"}</button><span className={modelSettingsState === "error" ? "save-message error" : "save-message"} aria-live="polite">{modelSettingsMessage}</span></div>
      </form>
    </div>
  );
}
