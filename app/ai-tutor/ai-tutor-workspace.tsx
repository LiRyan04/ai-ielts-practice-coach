"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { TutorMarkdown } from "../components/tutor-markdown";
import type { TutorMessage } from "../../lib/ai/tutor";

type Overview = {
  targetBand: number;
  totalMinutes: number;
  recentMinutes: number;
  completedExercises: number;
  listeningCount: number;
  readingCount: number;
  writingCount: number;
  hasSummary: boolean;
};

const quickPrompts = [
  "根据我的练习记录，我现在最应该优先提高什么？",
  "分析我最近的错题，给我一个今天能完成的训练任务。",
  "我的目标分数还差多少？怎样安排这一周？",
  "根据写作评审，给我一道针对薄弱项的小练习。",
];

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

export function AiTutorWorkspace({ initialMessages, initialPrompt = "", overview }: { initialMessages: TutorMessage[]; initialPrompt?: string; overview: Overview }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState(initialPrompt);
  const [sending, setSending] = useState(false);
  const [streamingId, setStreamingId] = useState("");
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const [recommendationLoadingIds, setRecommendationLoadingIds] = useState<string[]>([]);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const autoFollowRef = useRef(true);

  const lastContentLength = messages.at(-1)?.content.length ?? 0;
  const lastAssistant = messages.slice().reverse().find((message) => message.role === "assistant" && message.content);
  const followUps = lastAssistant && !sending ? lastAssistant.recommendations || [] : [];
  useEffect(() => {
    const container = messagesRef.current;
    if (!container || !autoFollowRef.current) return;
    container.scrollTo({ top: container.scrollHeight, behavior: sending ? "auto" : messages.length > initialMessages.length ? "smooth" : "auto" });
  }, [initialMessages.length, lastContentLength, messages.length, sending]);

  async function generateRecommendations(assistantMessageId: string) {
    setRecommendationLoadingIds((current) => [...current, assistantMessageId]);
    try {
      const response = await fetch("/api/ai-tutor/recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assistantMessageId }),
      });
      const payload = await response.json() as { recommendations?: string[] };
      if (response.ok && payload.recommendations?.length) {
        setMessages((current) => current.map((item) => item.id === assistantMessageId ? { ...item, recommendations: payload.recommendations } : item));
      }
    } finally {
      setRecommendationLoadingIds((current) => current.filter((id) => id !== assistantMessageId));
    }
  }

  async function sendMessage(content = input) {
    const message = content.trim();
    if (!message || sending) return;
    autoFollowRef.current = true;
    setShowScrollToBottom(false);
    const optimistic: TutorMessage = { id: `pending-${messages.length}-${message.length}`, role: "user", content: message, createdAt: "" };
    const streamId = `stream-${messages.length}-${message.length}`;
    const streamingMessage: TutorMessage = { id: streamId, role: "assistant", content: "", createdAt: "" };
    setMessages((current) => [...current, optimistic, streamingMessage]);
    setStreamingId(streamId);
    setInput("");
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/ai-tutor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "AI 助教暂时无法回答");
      }
      if (!response.body) throw new Error("浏览器无法读取 AI 流式响应");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let completed: { userMessage: TutorMessage; assistantMessage: TutorMessage } | null = null;
      let streamError = "";
      const handleFrame = (frame: string) => {
        const data = frame.split(/\r?\n/u).find((line) => line.startsWith("data:"))?.slice(5).trim();
        if (!data) return;
        try {
          const event = JSON.parse(data) as { type?: string; content?: string; error?: string; userMessage?: TutorMessage; assistantMessage?: TutorMessage };
          if (event.type === "delta" && event.content) setMessages((current) => current.map((item) => item.id === streamId ? { ...item, content: item.content + event.content } : item));
          else if (event.type === "done" && event.userMessage && event.assistantMessage) completed = { userMessage: event.userMessage, assistantMessage: event.assistantMessage };
          else if (event.type === "error") streamError = event.error || "AI 助教流式回答中断";
        } catch { /* wait for the next valid event */ }
      };
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const frames = pending.split(/\r?\n\r?\n/u);
        pending = frames.pop() || "";
        for (const frame of frames) handleFrame(frame);
        if (done) { if (pending.trim()) handleFrame(pending); break; }
      }
      if (streamError) throw new Error(streamError);
      if (!completed) throw new Error("AI 回答已结束，但没有收到保存确认");
      const saved = completed as { userMessage: TutorMessage; assistantMessage: TutorMessage };
      setMessages((current) => [...current.filter((item) => item.id !== optimistic.id && item.id !== streamId), saved.userMessage, saved.assistantMessage]);
      void generateRecommendations(saved.assistantMessage.id);
    } catch (requestError) {
      setMessages((current) => current.map((item) => item.id === streamId && item.content ? { ...item, content: `${item.content}\n\n> 回答中断，本段内容未保存。` } : item).filter((item) => item.id !== streamId || item.content));
      setError(requestError instanceof Error ? requestError.message : "AI 助教暂时无法回答");
    } finally { setStreamingId(""); setSending(false); }
  }

  async function clearConversation() {
    if (!window.confirm("确定清空当前账号的全部助教对话吗？此操作无法撤销。")) return;
    setClearing(true);
    setError("");
    try {
      const response = await fetch("/api/ai-tutor", { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "无法清空对话");
      setMessages([]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法清空对话");
    } finally { setClearing(false); }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function handleMessagesScroll() {
    const container = messagesRef.current;
    if (!container) return;
    const awayFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight >= 48;
    autoFollowRef.current = !awayFromBottom;
    setShowScrollToBottom(awayFromBottom);
  }

  function scrollMessagesToBottom() {
    const container = messagesRef.current;
    if (!container) return;
    autoFollowRef.current = true;
    setShowScrollToBottom(false);
    container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
  }

  return (
    <div className="tutor-page">
      <header className="page-heading tutor-heading">
        <div><p className="eyebrow">PERSONAL AI TUTOR</p><h1>AI 助教</h1></div>
        <button className="text-button tutor-clear" disabled={!messages.length || clearing} onClick={clearConversation} type="button">{clearing ? "清空中…" : "清空对话"}</button>
      </header>

      <div className="tutor-layout">
        <aside className="tutor-context card">
          <div><p className="eyebrow">LEARNER CONTEXT</p><h2>助教已了解</h2><span className="context-live"><i /> 每次提问前更新</span></div>
          <dl>
            <div><dt>目标分数</dt><dd>{overview.targetBand.toFixed(1)}</dd></div>
            <div><dt>累计学习</dt><dd>{overview.totalMinutes} 分钟</dd></div>
            <div><dt>近 7 天</dt><dd>{overview.recentMinutes} 分钟</dd></div>
            <div><dt>完成练习</dt><dd>{overview.completedExercises} 次</dd></div>
          </dl>
          <div className="tutor-skill-context" aria-label="全历史练习数量">
            <span>听力 {overview.listeningCount}</span><span>阅读 {overview.readingCount}</span><span>写作 {overview.writingCount}</span>
          </div>
          <p className="tutor-context-note">上下文包含最近成绩、错题答案、写作评分维度及最新学习总结。仅发送给你在设置中选择的 AI Provider。</p>
          <div className="tutor-context-links"><Link href="/my-practice">查看练习记录 →</Link><Link href="/settings">切换 AI 模型 →</Link></div>
        </aside>

        <section className="tutor-chat card" aria-label="AI 助教对话">
          <div className="tutor-messages" aria-live="polite" onScroll={handleMessagesScroll} ref={messagesRef}>
            {!messages.length ? <div className="tutor-welcome"><span className="tutor-avatar">AI</span><p className="eyebrow">READY TO COACH</p><h2>今天想从哪里开始？</h2><p>{overview.hasSummary ? "我已经读取了你的最新学习总结和练习证据，可以继续追问其中任何一项。" : "我已经读取了现有练习情况。完成更多练习后，我对趋势的判断会更准确。"}</p><div className="tutor-quick-prompts">{quickPrompts.map((prompt) => <button key={prompt} onClick={() => void sendMessage(prompt)} type="button">{prompt}</button>)}</div></div> : null}
            {messages.map((message) => <article className={`tutor-message ${message.role}`} key={message.id}>
              <div className="tutor-message-label"><strong>{message.role === "assistant" ? "AI 助教" : "你"}</strong><span>{formatTime(message.createdAt)}</span></div>
              {message.role === "assistant" ? message.content ? <TutorMarkdown content={message.content} /> : <div className="tutor-stream-wait"><i /><i /><i /> 思考中...</div> : <p>{message.content}</p>}
              {message.role === "assistant" && message.model ? <small>{message.model}</small> : null}
            </article>)}
            {lastAssistant && recommendationLoadingIds.includes(lastAssistant.id) ? <div className="tutor-recommendation-loading">正在生成推荐追问…</div> : null}
            {followUps.length ? <div className="tutor-follow-ups"><strong>推荐追问</strong><div>{followUps.map((question) => <button key={question} onClick={() => void sendMessage(question)} type="button">{question}</button>)}</div></div> : null}
            {sending && streamingId ? <span className="sr-only">AI 助教正在生成回答</span> : null}
          </div>
          {showScrollToBottom ? <button aria-label="回到最新消息" className="tutor-scroll-bottom" onClick={scrollMessagesToBottom} title="回到最新消息" type="button">↓</button> : null}
          <div className="tutor-composer">
            {error ? <p className="tutor-error">{error} <Link href="/settings">检查设置 →</Link></p> : null}
            <div><textarea aria-label="发给 AI 助教的消息" maxLength={4000} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} rows={3} value={input} /><button aria-label="发送消息" className="button button-primary" disabled={!input.trim() || sending} onClick={() => void sendMessage()} type="button">发送</button></div>
            <small>Enter 发送 · Shift + Enter 换行 · AI 建议和分数均为练习参考</small>
          </div>
        </section>
      </div>
    </div>
  );
}
