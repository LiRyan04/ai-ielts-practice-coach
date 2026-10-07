import { NextResponse } from "next/server";
import { ensureDatabase, getD1 } from "../../../db";
import { getAccountAiConfiguration, requireRequestAccount } from "../../../lib/account";
import { getTutorLearnerContext, getTutorMessages, requestTutorStream } from "../../../lib/ai/tutor";
import { AiConfigurationError } from "../../../lib/ai/qwen";

export async function POST(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const input = await request.json().catch(() => ({})) as Record<string, unknown>;
    const message = typeof input.message === "string" ? input.message.trim() : "";
    if (!message) return NextResponse.json({ error: "请输入想问助教的问题" }, { status: 400 });
    if (message.length > 4_000) return NextResponse.json({ error: "单条消息不能超过 4,000 个字符" }, { status: 400 });
    const configuration = await getAccountAiConfiguration(account.id);
    if (!configuration) throw new AiConfigurationError("请先在设置中配置文本 AI Provider 和 API Key");
    const [history, learnerContext] = await Promise.all([getTutorMessages(account.id, 20), getTutorLearnerContext(account.id)]);
    await ensureDatabase();
    const database = getD1();
    const upstream = await requestTutorStream({ message, history, learnerContext, signal: request.signal }, configuration);
    const encoder = new TextEncoder();
    let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    const emit = (controller: ReadableStreamDefaultController<Uint8Array>, value: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let answer = "";
        const append = (content: unknown) => {
          if (typeof content !== "string" || !content || answer.length >= 20_000) return;
          const delta = content.slice(0, 20_000 - answer.length);
          if (!delta) return;
          answer += delta;
          emit(controller, { type: "delta", content: delta });
        };
        const readPayload = (raw: string) => {
          if (!raw || raw === "[DONE]") return;
          try {
            const payload = JSON.parse(raw) as { choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown }; text?: unknown }> };
            const choice = payload.choices?.[0];
            const content = choice?.delta?.content ?? choice?.message?.content ?? choice?.text;
            if (Array.isArray(content)) {
              for (const part of content) if (part && typeof part === "object" && "text" in part) append((part as { text?: unknown }).text);
            } else append(content);
          } catch { /* ignore non-JSON provider events */ }
        };
        try {
          const contentType = upstream.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const payload = await upstream.json() as { choices?: Array<{ message?: { content?: unknown } }> };
            const content = payload.choices?.[0]?.message?.content;
            if (typeof content === "string") append(content);
          } else {
            upstreamReader = upstream.body!.getReader();
            const decoder = new TextDecoder();
            let pending = "";
            while (true) {
              const { done, value } = await upstreamReader.read();
              pending += decoder.decode(value, { stream: !done });
              const lines = pending.split(/\r?\n/u);
              pending = lines.pop() || "";
              for (const line of lines) if (line.startsWith("data:")) readPayload(line.slice(5).trim());
              if (answer.length >= 20_000) {
                await upstreamReader.cancel();
                break;
              }
              if (done) {
                if (pending.startsWith("data:")) readPayload(pending.slice(5).trim());
                break;
              }
            }
          }
          const content = answer.trim();
          if (!content) throw new Error("AI 助教没有返回可显示的文字，请重试");
          const userCreatedAt = new Date();
          const userMessage = { id: crypto.randomUUID(), role: "user" as const, content: message, createdAt: userCreatedAt.toISOString() };
          const assistantMessage = { id: crypto.randomUUID(), role: "assistant" as const, content, provider: configuration.provider, model: configuration.model, recommendations: [] as string[], createdAt: new Date(userCreatedAt.getTime() + 1).toISOString() };
          await database.batch([
            database.prepare("INSERT INTO tutor_messages (id, account_id, role, content, provider, model, recommendations_json, created_at) VALUES (?, ?, 'user', ?, NULL, NULL, NULL, ?)").bind(userMessage.id, account.id, userMessage.content, userMessage.createdAt),
            database.prepare("INSERT INTO tutor_messages (id, account_id, role, content, provider, model, recommendations_json, created_at) VALUES (?, ?, 'assistant', ?, ?, ?, NULL, ?)").bind(assistantMessage.id, account.id, assistantMessage.content, assistantMessage.provider, assistantMessage.model, assistantMessage.createdAt),
          ]);
          emit(controller, { type: "done", userMessage, assistantMessage });
          controller.close();
        } catch (streamError) {
          if (!request.signal.aborted) {
            emit(controller, { type: "error", error: streamError instanceof Error ? streamError.message : "AI 助教流式回答中断" });
            controller.close();
          }
        }
      },
      async cancel() { await upstreamReader?.cancel(); },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
  } catch (error) {
    if (error instanceof AiConfigurationError) return NextResponse.json({ error: error.message, code: "AI_NOT_CONFIGURED" }, { status: 503 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "AI 助教暂时无法回答" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const account = await requireRequestAccount(request);
    if (!account) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await ensureDatabase();
    await getD1().prepare("DELETE FROM tutor_messages WHERE account_id = ?").bind(account.id).run();
    return NextResponse.json({ cleared: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法清空对话" }, { status: 500 });
  }
}
