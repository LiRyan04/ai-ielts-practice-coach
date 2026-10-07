"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ListeningSection } from "../../lib/listening/library";
import { transcriptForTts, transcriptSegmentsForTts, type TranscriptTtsSegment } from "../../lib/listening/transcript";
import type { TtsProvider } from "../../lib/account";

const WAVEFORM_BARS = 56;
const PREFETCH_LIMIT = 8;

type TtsAsset = { buffer: ArrayBuffer; mimeType: string; provider: string; waveform: number[]; durationSeconds: number };
const ttsRequests = new Map<string, Promise<TtsAsset>>();
export type ListeningTtsModel = string;
export type ListeningTtsVoice = string;

const MIMO_VOICES: Array<{ value: ListeningTtsVoice; label: string }> = [
  { value: "Mia", label: "Mia · 女声" },
  { value: "Chloe", label: "Chloe · 女声" },
  { value: "Milo", label: "Milo · 男声" },
  { value: "Dean", label: "Dean · 男声" },
];
const QWEN_VOICES: Array<{ value: ListeningTtsVoice; label: string }> = [
  { value: "Cherry", label: "Cherry · 女声" },
  { value: "Serena", label: "Serena · 女声" },
  { value: "Ethan", label: "Ethan · 男声" },
  { value: "Chelsie", label: "Chelsie · 女声" },
];
const OPENAI_VOICES = [{ value: "marin", label: "Marin · 推荐" }, { value: "cedar", label: "Cedar · 推荐" }, { value: "coral", label: "Coral" }, { value: "alloy", label: "Alloy" }, { value: "nova", label: "Nova" }, { value: "onyx", label: "Onyx" }];
const DEEPGRAM_VOICES = [{ value: "thalia", label: "Thalia · 女声" }, { value: "apollo", label: "Apollo · 男声" }, { value: "athena", label: "Athena · 女声" }, { value: "orion", label: "Orion · 男声" }];

function providerLabel(provider: TtsProvider) {
  return provider === "mimo" ? "MiMo" : provider === "dashscope" ? "Qwen" : provider === "openai" ? "OpenAI" : provider === "deepgram" ? "Deepgram" : "浏览器";
}

function providerModels(provider: TtsProvider, selected: string) {
  const models = provider === "mimo" ? ["mimo-v2.5-tts"] : provider === "dashscope" ? ["qwen3-tts-flash", "qwen3-tts-instruct-flash"] : provider === "openai" ? ["gpt-4o-mini-tts"] : provider === "deepgram" ? ["aura-2"] : ["browser"];
  return models.includes(selected) ? models : [selected, ...models];
}

function providerVoices(provider: TtsProvider) {
  return provider === "mimo" ? MIMO_VOICES : provider === "dashscope" ? QWEN_VOICES : provider === "openai" ? OPENAI_VOICES : provider === "deepgram" ? DEEPGRAM_VOICES : [{ value: "default", label: "系统默认英文音色" }];
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function fallbackWaveform(seed: string) {
  let value = 2166136261;
  for (const character of seed) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return Array.from({ length: WAVEFORM_BARS }, (_, index) => {
    value = Math.imul(value ^ index, 16777619);
    return 22 + (Math.abs(value) % 70);
  });
}

async function analyzeAudio(buffer: ArrayBuffer, seed: string): Promise<{ waveform: number[]; durationSeconds: number }> {
  try {
    const context = new AudioContext();
    const decoded = await context.decodeAudioData(buffer.slice(0));
    const channel = decoded.getChannelData(0);
    const binSize = Math.max(1, Math.floor(channel.length / WAVEFORM_BARS));
    const peaks = Array.from({ length: WAVEFORM_BARS }, (_, index) => {
      const start = index * binSize;
      const end = Math.min(channel.length, start + binSize);
      let peak = 0;
      for (let cursor = start; cursor < end; cursor += Math.max(1, Math.floor(binSize / 250))) {
        peak = Math.max(peak, Math.abs(channel[cursor] || 0));
      }
      return peak;
    });
    const durationSeconds = decoded.duration;
    await context.close();
    const maximum = Math.max(...peaks, 0.001);
    return {
      waveform: peaks.map((peak) => Math.max(14, Math.round((peak / maximum) * 92))),
      durationSeconds,
    };
  } catch {
    return { waveform: fallbackWaveform(seed), durationSeconds: 0 };
  }
}

function requestTts(text: string, model: ListeningTtsModel, voice: ListeningTtsVoice): Promise<TtsAsset> {
  const cacheId = `${model}\n${voice}\n${text}`;
  const existing = ttsRequests.get(cacheId);
  if (existing) return existing;
  const request = fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, model, voice }),
  }).then(async (response) => {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(payload.error || "神经 TTS 暂时不可用");
    }
    const buffer = await response.arrayBuffer();
    const analysis = await analyzeAudio(buffer, text);
    return {
      buffer,
      mimeType: response.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
      provider: response.headers.get("x-tts-provider") || "neural",
      waveform: analysis.waveform,
      durationSeconds: analysis.durationSeconds,
    };
  }).catch((error) => {
    ttsRequests.delete(cacheId);
    throw error;
  });
  if (ttsRequests.size >= PREFETCH_LIMIT) {
    const oldest = ttsRequests.keys().next().value as string | undefined;
    if (oldest) ttsRequests.delete(oldest);
  }
  ttsRequests.set(cacheId, request);
  return request;
}

function base64Bytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function pcmWave(chunks: Uint8Array[], sampleRate = 24_000) {
  const pcmLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const wave = new Uint8Array(44 + pcmLength);
  const view = new DataView(wave.buffer);
  const write = (offset: number, text: string) => Array.from(text).forEach((character, index) => wave[offset + index] = character.charCodeAt(0));
  write(0, "RIFF"); view.setUint32(4, 36 + pcmLength, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, pcmLength, true);
  let offset = 44;
  for (const chunk of chunks) { wave.set(chunk, offset); offset += chunk.byteLength; }
  return wave.buffer;
}

async function requestStreamingTts(text: string, segments: TranscriptTtsSegment[], model: ListeningTtsModel, voice: ListeningTtsVoice, onChunk: (chunk: Uint8Array) => void): Promise<TtsAsset> {
  const response = await fetch("/api/tts/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, segments, model, voice }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || "流式 TTS 暂时不可用");
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.startsWith("audio/")) {
    const buffer = await response.arrayBuffer();
    const analysis = await analyzeAudio(buffer, text);
    return { buffer, mimeType: contentType.split(";")[0], provider: response.headers.get("x-tts-provider") || "neural", waveform: analysis.waveform, durationSeconds: analysis.durationSeconds };
  }
  if (!response.body) throw new Error("流式 TTS 没有返回音频数据");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let pending = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as { type: "audio" | "done" | "error"; data?: string; error?: string };
      if (event.type === "audio" && event.data) {
        const chunk = base64Bytes(event.data);
        chunks.push(chunk);
        onChunk(chunk);
      } else if (event.type === "error") throw new Error(event.error || "流式合成失败");
    }
  }
  if (!chunks.length) throw new Error("流式 TTS 没有返回音频片段");
  const buffer = pcmWave(chunks);
  const analysis = await analyzeAudio(buffer, text);
  return {
    buffer,
    mimeType: "audio/wav",
    provider: model === "mimo-v2.5-tts" ? "mimo" : "qwen",
    waveform: analysis.waveform,
    durationSeconds: analysis.durationSeconds || (buffer.byteLength - 44) / 2 / 24_000,
  };
}

export function ListeningAudioPlayer({ section, prefetchSection, ttsProvider, initialTtsModel, initialTtsVoice, mode, onTranscriptProgress }: { section: ListeningSection; prefetchSection?: ListeningSection; ttsProvider: TtsProvider; initialTtsModel: ListeningTtsModel; initialTtsVoice: ListeningTtsVoice; mode: "practice" | "exam"; onTranscriptProgress?: (progress: number | null) => void }) {
  const hasOriginal = section.audio.mode === "file" && Boolean(section.audio.url);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayedSourceRef = useRef<string | null>(null);
  const generatedObjectUrlRef = useRef<string | null>(null);
  const streamContextRef = useRef<AudioContext | null>(null);
  const streamQueueRef = useRef<Uint8Array[]>([]);
  const streamNextTimeRef = useRef(0);
  const streamStartTimeRef = useRef<number | null>(null);
  const streamRequestedRef = useRef(false);
  const streamCompleteRef = useRef(false);
  const streamModeRef = useRef(false);
  const streamReceivedSecondsRef = useRef(0);
  const progressFrameRef = useRef<number | null>(null);
  const rateRef = useRef(1);
  const [selectedSource, setSelectedSource] = useState<"original" | "tts">(hasOriginal ? "original" : "tts");
  const [ttsModel, setTtsModel] = useState<ListeningTtsModel>(initialTtsModel);
  const [ttsVoice, setTtsVoice] = useState<ListeningTtsVoice>(initialTtsVoice);
  const [sourceUrl, setSourceUrl] = useState<string | null>(hasOriginal ? section.audio.url : null);
  const [sourceKind, setSourceKind] = useState<"original" | "neural" | "browser">(hasOriginal ? "original" : ttsProvider === "browser" ? "browser" : "neural");
  const [loading, setLoading] = useState(!hasOriginal && ttsProvider !== "browser");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [generationStatus, setGenerationStatus] = useState<"idle" | "generating" | "ready">(hasOriginal ? "idle" : ttsProvider === "browser" ? "ready" : "generating");
  const [message, setMessage] = useState(hasOriginal ? "原始考试录音" : ttsProvider === "browser" ? "浏览器内置英文语音" : `${providerLabel(ttsProvider)} 实时 TTS · 正在等待首个音频片段…`);
  const [waveform, setWaveform] = useState(() => fallbackWaveform(section.id));
  const [autoplay, setAutoplay] = useState(false);
  const ttsText = useMemo(() => transcriptForTts(section.transcript), [section.transcript]);
  const ttsSegments = useMemo(() => transcriptSegmentsForTts(section.transcript), [section.transcript]);
  const estimatedDuration = useMemo(() => Math.max(8, ttsText.split(/\s+/u).length / 2.4), [ttsText]);

  useEffect(() => {
    const timer = window.setTimeout(() => setAutoplay(window.localStorage.getItem("ielts-listening-autoplay") === "true"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (ttsProvider !== "browser" && prefetchSection?.audio.mode === "tts" && prefetchSection.transcript) {
      const segments = transcriptSegmentsForTts(prefetchSection.transcript);
      if (segments.length <= 1) void requestTts(transcriptForTts(prefetchSection.transcript), ttsModel, ttsVoice).catch(() => undefined);
    }
  }, [prefetchSection, ttsModel, ttsProvider, ttsVoice]);

  useEffect(() => {
    let cancelled = false;
    window.speechSynthesis?.cancel();
    autoPlayedSourceRef.current = null;

    if (selectedSource === "tts" && ttsProvider !== "browser") {
      void requestStreamingTts(ttsText, ttsSegments, ttsModel, ttsVoice, receiveStreamChunk).then((asset) => {
        if (cancelled) return;
        generatedObjectUrlRef.current = URL.createObjectURL(new Blob([asset.buffer], { type: asset.mimeType }));
        setSourceUrl(generatedObjectUrlRef.current);
        setWaveform(asset.waveform);
        setSourceKind("neural");
        streamCompleteRef.current = true;
        if (streamModeRef.current && streamContextRef.current && streamContextRef.current.currentTime >= streamNextTimeRef.current - 0.06) {
          streamModeRef.current = false;
          setPlaying(false);
          onTranscriptProgress?.(1);
        }
        setDuration(asset.durationSeconds);
        setGenerationStatus("ready");
        setMessage(`${providerLabel(ttsProvider)} TTS · 已缓存完整音频`);
        setLoading(false);
      }).catch((error) => {
        if (cancelled) return;
        setSourceKind("browser");
        setGenerationStatus("ready");
        setMessage(error instanceof Error ? `${error.message}，已切换浏览器语音` : "已切换浏览器语音");
        setLoading(false);
      });
    }

    return () => {
      cancelled = true;
      if (generatedObjectUrlRef.current) URL.revokeObjectURL(generatedObjectUrlRef.current);
      generatedObjectUrlRef.current = null;
      if (progressFrameRef.current) window.cancelAnimationFrame(progressFrameRef.current);
      void streamContextRef.current?.close();
      streamContextRef.current = null;
      streamQueueRef.current = [];
      streamNextTimeRef.current = 0;
      streamStartTimeRef.current = null;
      streamRequestedRef.current = false;
      streamCompleteRef.current = false;
      streamModeRef.current = false;
      streamReceivedSecondsRef.current = 0;
      progressFrameRef.current = null;
      window.speechSynthesis?.cancel();
    };
    // The component is keyed by section. Restarting this effect on callback
    // identity changes would duplicate a paid streaming synthesis request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, selectedSource, ttsModel, ttsProvider, ttsSegments, ttsText, ttsVoice]);

  useEffect(() => {
    if (!autoplay || loading || !sourceUrl || autoPlayedSourceRef.current === sourceUrl) return;
    if (audioRef.current) {
      autoPlayedSourceRef.current = sourceUrl;
      void audioRef.current.play().catch(() => setMessage((current) => `${current} · 点击播放以继续`));
    }
  }, [autoplay, loading, sourceUrl]);

  const isGenerating = selectedSource === "tts" && sourceKind === "neural" && generationStatus === "generating";
  const timelineDuration = isGenerating ? Math.max(duration, estimatedDuration, currentTime) : duration;
  const progress = timelineDuration > 0 ? Math.min(100, (currentTime / timelineDuration) * 100) : 0;
  const badge = sourceKind === "original" ? "ORIGINAL AUDIO" : sourceKind === "neural" ? "NEURAL TTS" : "BROWSER TTS";

  function updateStreamingProgress() {
    const context = streamContextRef.current;
    const start = streamStartTimeRef.current;
    if (!context || start == null) { progressFrameRef.current = null; return; }
    const elapsed = Math.max(0, (context.currentTime - start) * rateRef.current);
    setCurrentTime(elapsed);
    const progressDuration = streamCompleteRef.current && streamReceivedSecondsRef.current > 0
      ? streamReceivedSecondsRef.current
      : Math.max(streamReceivedSecondsRef.current, estimatedDuration);
    onTranscriptProgress?.(Math.min(1, elapsed / progressDuration));
    if (streamModeRef.current) progressFrameRef.current = window.requestAnimationFrame(updateStreamingProgress);
  }

  function scheduleStreamChunk(chunk: Uint8Array) {
    const context = streamContextRef.current;
    if (!context) { streamQueueRef.current.push(chunk); return; }
    const samples = Math.floor(chunk.byteLength / 2);
    const audioBuffer = context.createBuffer(1, samples, 24_000);
    const output = audioBuffer.getChannelData(0);
    const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    for (let index = 0; index < samples; index += 1) output[index] = view.getInt16(index * 2, true) / 32768;
    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = rateRef.current;
    source.connect(context.destination);
    const startAt = Math.max(context.currentTime + 0.025, streamNextTimeRef.current);
    if (streamStartTimeRef.current == null) streamStartTimeRef.current = startAt;
    streamNextTimeRef.current = startAt + audioBuffer.duration / rateRef.current;
    source.start(startAt);
    source.onended = () => {
      if (streamCompleteRef.current && context.currentTime >= streamNextTimeRef.current - 0.06) {
        streamModeRef.current = false;
        setPlaying(false);
        onTranscriptProgress?.(1);
      }
    };
  }

  function receiveStreamChunk(chunk: Uint8Array) {
    streamReceivedSecondsRef.current += chunk.byteLength / 2 / 24_000;
    setDuration(streamReceivedSecondsRef.current);
    setLoading(false);
    setMessage(`${providerLabel(ttsProvider)} 实时 TTS · 可边生成边播放`);
    if (streamRequestedRef.current) scheduleStreamChunk(chunk);
    else streamQueueRef.current.push(chunk);
    if (streamRequestedRef.current && !progressFrameRef.current) progressFrameRef.current = window.requestAnimationFrame(updateStreamingProgress);
  }

  async function startStreamPlayback() {
    streamRequestedRef.current = true;
    streamModeRef.current = true;
    const context = streamContextRef.current || new AudioContext({ sampleRate: 24_000 });
    streamContextRef.current = context;
    await context.resume();
    const queued = streamQueueRef.current.splice(0);
    queued.forEach(scheduleStreamChunk);
    setPlaying(true);
    if (!progressFrameRef.current) progressFrameRef.current = window.requestAnimationFrame(updateStreamingProgress);
  }

  function speakInBrowser() {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      setMessage("当前浏览器不支持语音朗读");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(ttsText);
    utterance.lang = "en-GB";
    utterance.rate = rate;
    setDuration(estimatedDuration);
    setGenerationStatus("ready");
    utterance.onend = () => { setPlaying(false); setCurrentTime(estimatedDuration); onTranscriptProgress?.(1); };
    utterance.onerror = () => setPlaying(false);
    utterance.onboundary = (event) => {
      const boundaryProgress = Math.min(1, event.charIndex / Math.max(1, ttsText.length));
      setCurrentTime(boundaryProgress * estimatedDuration);
      onTranscriptProgress?.(boundaryProgress);
    };
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  }

  async function togglePlayback() {
    if (sourceKind === "browser") {
      if (playing) {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        else window.speechSynthesis.pause();
        setPlaying(!window.speechSynthesis.paused);
      } else speakInBrowser();
      return;
    }
    if (selectedSource === "tts" && (!streamCompleteRef.current || streamModeRef.current)) {
      if (!streamRequestedRef.current) await startStreamPlayback();
      else if (streamContextRef.current?.state === "running") { await streamContextRef.current.suspend(); setPlaying(false); }
      else { await streamContextRef.current?.resume(); setPlaying(true); }
      return;
    }
    const audio = audioRef.current;
    if (!audio || !sourceUrl) return;
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch {
      setMessage("音频播放失败，正在尝试备用语音…");
    }
  }

  function fallbackFromOriginal() {
    if (sourceKind !== "original" || loading) return;
    chooseSource("tts", `原始录音无法加载，正在准备 ${providerLabel(ttsProvider)} TTS…`);
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = (value / 100) * duration;
    setCurrentTime(audio.currentTime);
    onTranscriptProgress?.(value / 100);
  }

  function changeRate(value: number) {
    rateRef.current = value;
    setRate(value);
    if (audioRef.current) audioRef.current.playbackRate = value;
    if (sourceKind === "browser" && playing) {
      window.speechSynthesis.cancel();
      setPlaying(false);
    }
  }

  function changeVolume(value: number) {
    setVolume(value);
    if (audioRef.current) audioRef.current.volume = value;
  }

  function stopCurrentPlayback() {
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    if (progressFrameRef.current) window.cancelAnimationFrame(progressFrameRef.current);
    progressFrameRef.current = null;
    void streamContextRef.current?.close();
    streamContextRef.current = null;
    streamQueueRef.current = [];
    streamNextTimeRef.current = 0;
    streamStartTimeRef.current = null;
    streamRequestedRef.current = false;
    streamCompleteRef.current = false;
    streamModeRef.current = false;
    streamReceivedSecondsRef.current = 0;
    setGenerationStatus("idle");
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    onTranscriptProgress?.(null);
  }

  function chooseSource(nextSource: "original" | "tts", nextMessage?: string) {
    if (nextSource === selectedSource) return;
    stopCurrentPlayback();
    autoPlayedSourceRef.current = null;
    if (nextSource === "original" && hasOriginal) {
      setSourceUrl(section.audio.mode === "file" ? section.audio.url : null);
      setSourceKind("original");
      setWaveform(fallbackWaveform(section.id));
      setMessage("原始考试录音");
      setGenerationStatus("idle");
      setLoading(false);
    } else {
      setSourceUrl(null);
      setSourceKind(ttsProvider === "browser" ? "browser" : "neural");
      setWaveform(fallbackWaveform(`${section.id}-${ttsVoice}`));
      setMessage(nextMessage || (ttsProvider === "browser" ? "浏览器内置英文语音" : `${providerLabel(ttsProvider)} 实时 TTS · 正在等待首个音频片段…`));
      setGenerationStatus(ttsProvider === "browser" ? "ready" : "generating");
      setLoading(ttsProvider !== "browser");
    }
    setSelectedSource(nextSource);
  }

  function chooseVoice(voice: ListeningTtsVoice) {
    if (voice === ttsVoice) return;
    if (selectedSource === "tts") {
      stopCurrentPlayback();
      setSourceUrl(null);
      setSourceKind("neural");
      setWaveform(fallbackWaveform(`${section.id}-${voice}`));
      setMessage(`正在使用 ${voice} 重新生成…`);
      setGenerationStatus("generating");
      setLoading(true);
    }
    setTtsVoice(voice);
  }

  function chooseModel(model: ListeningTtsModel) {
    if (model === ttsModel) return;
    const voice = ttsVoice;
    if (selectedSource === "tts") {
      stopCurrentPlayback();
      setSourceUrl(null);
      setSourceKind("neural");
      setWaveform(fallbackWaveform(`${section.id}-${model}-${voice}`));
      setMessage(`正在切换到 ${model}…`);
      setGenerationStatus("generating");
      setLoading(true);
    }
    setTtsModel(model);
    setTtsVoice(voice);
  }

  const barElements = useMemo(() => waveform.map((height, index) => (
    <i className={index / waveform.length * 100 <= progress ? "played" : ""} key={index} style={{ height: `${height}%` }} />
  )), [progress, waveform]);

  return (
    <div className="listening-player unified-audio-player">
      <div className="player-heading">
        <div><span className={`audio-mode-badge ${sourceKind === "original" ? "file" : "tts"}`}>{badge}</span><strong>Part {section.number} audio</strong></div>
        <small>{message}</small>
      </div>
      {mode === "practice" ? <details className="audio-practice-options">
        <summary>Practice audio options</summary>
        <div className="audio-source-controls">
          <div aria-label="音频来源" className="audio-source-switch" role="group">
            {hasOriginal && <button aria-pressed={selectedSource === "original"} className={selectedSource === "original" ? "active" : ""} onClick={() => chooseSource("original")} type="button">原始 MP3</button>}
            <button aria-pressed={selectedSource === "tts"} className={selectedSource === "tts" ? "active" : ""} onClick={() => chooseSource("tts")} type="button">AI TTS</button>
          </div>
          {selectedSource === "tts" && <div className="audio-tts-options"><span className="audio-provider-name">{providerLabel(ttsProvider)}</span><label className="audio-voice">模型<select aria-label="TTS 模型" onChange={(event) => chooseModel(event.target.value)} value={ttsModel}>{providerModels(ttsProvider, ttsModel).map((model) => <option key={model} value={model}>{model}</option>)}</select></label><label className="audio-voice">默认音色<select aria-label="TTS 默认音色" onChange={(event) => chooseVoice(event.target.value)} value={ttsVoice}>{providerVoices(ttsProvider).map((voice) => <option key={voice.value} value={voice.value}>{voice.label}</option>)}</select></label></div>}
        </div>
        <label className="audio-autoplay"><input checked={autoplay} onChange={(event) => { setAutoplay(event.target.checked); window.localStorage.setItem("ielts-listening-autoplay", String(event.target.checked)); }} type="checkbox" />切换 Part 后自动播放</label>
      </details> : null}
      {sourceUrl && (
        <audio
          ref={audioRef}
          onDurationChange={(event) => {
            const mediaDuration = event.currentTarget.duration;
            if (Number.isFinite(mediaDuration) && mediaDuration > 0) setDuration(mediaDuration);
          }}
          onEnded={(event) => { setPlaying(false); setCurrentTime(event.currentTarget.duration); onTranscriptProgress?.(1); }}
          onError={fallbackFromOriginal}
          onLoadedMetadata={(event) => {
            const mediaDuration = event.currentTarget.duration;
            if (Number.isFinite(mediaDuration) && mediaDuration > 0) setDuration(mediaDuration);
          }}
          onPause={() => setPlaying(false)}
          onPlay={(event) => { setPlaying(true); onTranscriptProgress?.(event.currentTarget.duration ? event.currentTarget.currentTime / event.currentTarget.duration : 0); }}
          onTimeUpdate={(event) => {
            setCurrentTime(event.currentTarget.currentTime);
            onTranscriptProgress?.(event.currentTarget.duration ? event.currentTarget.currentTime / event.currentTarget.duration : null);
          }}
          preload="auto"
          src={sourceUrl}
        />
      )}
      <div className={`audio-console ${mode}`}>
        <button className="audio-play-button" disabled={loading} onClick={() => void togglePlayback()} type="button" aria-label={playing ? "暂停音频" : "播放音频"}>
          {loading ? "…" : playing ? "Ⅱ" : "▶"}
        </button>
        <div className={`audio-waveform ${sourceKind === "browser" ? "not-seekable" : ""}`}>
          <div aria-hidden="true" className="audio-waveform-bars">{barElements}</div>
          {sourceKind !== "browser" && <input aria-label="音频播放位置" max="100" min="0" onChange={(event) => seek(Number(event.target.value))} step="0.1" type="range" value={progress} />}
        </div>
        <span className={isGenerating ? "audio-time generating" : "audio-time"}>{formatAudioTime(currentTime)} / {isGenerating ? "生成中" : duration ? formatAudioTime(duration) : "--:--"}</span>
        <label className="audio-volume"><span aria-hidden="true">◖</span><input aria-label="音量" max="1" min="0" onChange={(event) => changeVolume(Number(event.target.value))} step="0.05" type="range" value={volume} /></label>
        {mode === "practice" ? <label className="audio-rate">语速<select onChange={(event) => changeRate(Number(event.target.value))} value={rate}><option value="0.75">0.75×</option><option value="0.9">0.9×</option><option value="1">1.0×</option><option value="1.15">1.15×</option><option value="1.25">1.25×</option></select></label> : null}
      </div>
    </div>
  );
}
